// Planilha .xlsx só para leitura (Dados e relatórios): as abas são montadas
// aqui, sem banco nem Excel, a partir dos mesmos números das telas. A leitura
// dos dados e a gravação do arquivo ficam em server/export-workbook.ts.

import { displayMonth } from "@/lib/date";
import { FAMILY_SCOPE, accountTable, type EvolutionAccount, type EvolutionData } from "@/lib/evolution";

/** Códigos de formato do Excel: invariantes, o Excel mostra com a vírgula e o ponto do idioma de quem abre. */
export const XLSX_FORMATS = {
  money: '"R$" #,##0.00;-"R$" #,##0.00',
  percent: "0.0%",
  progress: "0%",
  month: "mmm/yy",
  decimal: "0.0",
  months: '0.0" meses"',
  integer: "#,##0",
  general: "General",
} as const;

export type NumberCell = { value: number; format: string };
/** Texto, número com formato (nunca número solto) ou célula vazia. */
export type SheetCell = string | NumberCell | null;

export type ExportSheet = {
  name: string;
  rows: SheetCell[][];
  /** Largura de cada coluna, em caracteres. */
  widths: number[];
  /** Linhas cobertas pelo filtro do Excel, contando o cabeçalho (sem filtro quando ausente). */
  filterRows?: number;
};

/** Uma linha do histórico do dashboard (getSnapshotHistory): última revisão de cada mês fechado. */
export type ExportHistoryRow = {
  month: string;
  cashTotal: number;
  investmentsTotal: number;
  assetsTotal: number;
  debtPvTotal: number;
  netWorth: number;
  monthlyVariation: number;
  debtToAssets: number;
  reserveMonths: number;
  patrimonialSavingsRate: number;
};

export type ExportDebtRow = {
  /** Mês da declaração ("AAAA-MM"). */
  base: string;
  /** Mês de vencimento ("AAAA-MM"). */
  due: string;
  personName: string;
  cardName: string;
  amount: number;
  description: string | null;
};

export type BudgetKind = "income" | "fixed_expense" | "variable_expense";

export type ExportBudgetItem = {
  kind: BudgetKind;
  name: string;
  personName: string | null;
  amountMonthly: number;
  recurrence: "monthly" | "annualized" | "one_off";
  startMonth: string;
  endMonth: string | null;
};

export type ExportBudget = {
  /** Itens que contam no mês de referência. */
  items: ExportBudgetItem[];
  /** Média móvel do cartão que entra nas variáveis (null quando não entra). */
  card: { amount: number; months: number; partial: boolean } | null;
  totals: { income: number; fixedExpense: number; variableExpense: number; surplus: number };
};

export type ExportGoal = {
  title: string;
  horizon: "short" | "medium" | "long";
  metricKey: string;
  currentValue: string | null;
  currentNumeric: number | null;
  targetValue: string | null;
  targetNumeric: number | null;
  targetDate: string | null;
  progressPct: number;
  status: "achieved" | "in_progress" | "attention" | "long_term";
  progressSource: "calculated" | "manual" | "empty";
  requiredCagr: number | null;
  notes: string | null;
};

export type ExportWorkbookData = {
  /** Mês de referência ("AAAA-MM"): o último fechamento, ou o mês atual se nenhum foi fechado. */
  referenceMonth: string;
  history: ExportHistoryRow[];
  evolution: Pick<EvolutionData, "people" | "accounts" | "months">;
  debts: ExportDebtRow[];
  budget: ExportBudget;
  goals: ExportGoal[];
};

export function exportFileName(referenceMonth: string): string {
  return `relatorio-financeiro-${referenceMonth.slice(0, 7)}.xlsx`;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Data do Excel (dias desde 30/12/1899) do primeiro dia do mês, sem depender do fuso de quem gera. */
export function excelMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return (Date.UTC(year, monthNumber - 1, 1) - EXCEL_EPOCH) / 86_400_000;
}

const money = (value: number): NumberCell => ({ value, format: XLSX_FORMATS.money });
const percent = (value: number): NumberCell => ({ value, format: XLSX_FORMATS.percent });
const monthCell = (month: string): NumberCell => ({ value: excelMonth(month), format: XLSX_FORMATS.month });

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

/** Tamanho aproximado do que o Excel mostra na célula: número que não cabe na coluna vira "####". */
function displayLength(cell: SheetCell | undefined): number {
  if (cell === null || cell === undefined) return 0;
  if (typeof cell === "string") return cell.length;
  switch (cell.format) {
    case XLSX_FORMATS.money:
      return brl.format(cell.value).length;
    case XLSX_FORMATS.month:
      return 6;
    case XLSX_FORMATS.percent:
    case XLSX_FORMATS.progress:
      return pct.format(cell.value).length;
    case XLSX_FORMATS.decimal:
      return cell.value.toFixed(1).length;
    case XLSX_FORMATS.months:
      return `${cell.value.toFixed(1)} meses`.length;
    default:
      return plain.format(cell.value).length;
  }
}

/** Largura de cada coluna para caber o maior conteúdo, mais a seta do filtro no cabeçalho. */
function columnWidths(rows: SheetCell[][], min = 9, max = 60): number[] {
  const columns = Math.max(...rows.map((row) => row.length));
  return Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(...rows.map((row) => displayLength(row[column])));
    return Math.min(Math.max(longest + 3, min), max);
  });
}

export function buildExportSheets(data: ExportWorkbookData): ExportSheet[] {
  return [
    summarySheet(data.history),
    accountsSheet(data.evolution),
    debtsSheet(data.debts),
    budgetSheet(data.budget, data.referenceMonth),
    goalsSheet(data.goals, data.referenceMonth),
  ];
}

const SUMMARY_HEADER = [
  "Mês",
  "Caixa (com VR/VA)",
  "Investimentos (com cashback)",
  "Total de ativos",
  "Dívidas do cartão (valor presente)",
  "Patrimônio líquido",
  "Variação do patrimônio",
  "Dívida / ativos",
  "Meses de reserva",
  "Taxa de poupança",
];

function summarySheet(history: ExportHistoryRow[]): ExportSheet {
  const rows = history.map((row, index): SheetCell[] => {
    // O primeiro fechamento não tem mês anterior: variação e taxa de poupança ficam em branco.
    const first = index === 0;
    return [
      monthCell(row.month),
      money(row.cashTotal),
      money(row.investmentsTotal),
      money(row.assetsTotal),
      money(row.debtPvTotal),
      money(row.netWorth),
      first ? null : money(row.monthlyVariation),
      percent(row.debtToAssets),
      { value: row.reserveMonths, format: XLSX_FORMATS.decimal },
      first ? null : percent(row.patrimonialSavingsRate),
    ];
  });
  return {
    name: "Resumo mensal",
    rows: [SUMMARY_HEADER, ...rows],
    widths: columnWidths([SUMMARY_HEADER, ...rows]),
    filterRows: rows.length + 1,
  };
}

const GROUP_LABELS = { cash: "CAIXA", investments: "INVESTIMENTOS" } as const;
const GROUP_TOTAL_LABELS = { cash: "Total em caixa", investments: "Total investido" } as const;
const CATEGORY_LABELS = { cash: "Caixa", benefit: "VR/VA", investment: "Investimentos", cashback: "Cashback" } as const;

/** Como na tabela "Mês a mês": VR/VA e cashback dizem a categoria quando o nome da conta não diz. */
function accountLabel(account: EvolutionAccount) {
  const category = CATEGORY_LABELS[account.category];
  const showCategory = (account.category === "benefit" || account.category === "cashback") && account.name !== category;
  return showCategory ? `${account.name} (${category})` : account.name;
}

/** A tabela "Mês a mês" da página de cada pessoa, para a família e para cada pessoa, um bloco abaixo do outro. */
function accountsSheet(evolution: ExportWorkbookData["evolution"]): ExportSheet {
  const months = evolution.months.map((row) => row.month);
  const header: SheetCell[] = ["Pessoa", "Conta", ...months.map(monthCell)];
  const names = new Map(evolution.people.map((person) => [person.id, person.name]));
  const scopes = [{ id: FAMILY_SCOPE, label: "Família" }, ...evolution.people.map((person) => ({ id: person.id, label: person.name }))];
  const rows: SheetCell[][] = [];

  if (months.length > 0) {
    for (const scope of scopes) {
      const table = accountTable(evolution, scope.id);
      if (rows.length > 0) rows.push([]);
      const line = (label: string, values: SheetCell[] = []) => rows.push([scope.label, label, ...values]);
      for (const group of table.groups) {
        line(GROUP_LABELS[group.group]);
        for (const { account, values } of group.accounts) {
          // Na família, contas de nomes iguais ("Investimentos") se distinguem pela pessoa.
          const label = scope.id === FAMILY_SCOPE ? `${names.get(account.personId) ?? "?"} — ${accountLabel(account)}` : accountLabel(account);
          line(label, values.map(money));
        }
        line(GROUP_TOTAL_LABELS[group.group], group.totals.map(money));
      }
      line("Dívidas do cartão (valor presente)", table.debts.map(money));
      line("Patrimônio líquido", table.netWorth.map(money));
      line("Variação no mês", table.changes.map((value) => (value === null ? null : money(value))));
    }
  }

  return {
    name: "Contas mês a mês",
    rows: [header, ...rows],
    widths: columnWidths([header, ...rows]),
    filterRows: rows.length + 1,
  };
}

const DEBT_HEADER = ["Base", "Vencimento", "Pessoa", "Cartão", "Valor", "Descrição"];

/** Todos os lançamentos do cartão, da base mais recente para a mais antiga (como a API de dívidas). */
function debtsSheet(debts: ExportDebtRow[]): ExportSheet {
  const sorted = [...debts].sort(
    (a, b) =>
      b.base.localeCompare(a.base) ||
      a.personName.localeCompare(b.personName, "pt-BR") ||
      a.due.localeCompare(b.due) ||
      a.cardName.localeCompare(b.cardName, "pt-BR"),
  );
  const rows = sorted.map((row): SheetCell[] => [
    monthCell(row.base),
    monthCell(row.due),
    row.personName,
    row.cardName,
    money(row.amount),
    row.description || null,
  ]);
  return {
    name: "Dívidas do cartão",
    rows: [DEBT_HEADER, ...rows],
    widths: columnWidths([DEBT_HEADER, ...rows]),
    filterRows: rows.length + 1,
  };
}

const BUDGET_HEADER = ["Tipo", "Item", "Pessoa", "Valor mensal", "Recorrência", "Início", "Fim"];
const BUDGET_KINDS: BudgetKind[] = ["income", "fixed_expense", "variable_expense"];
const KIND_LABELS: Record<BudgetKind, string> = { income: "Entrada", fixed_expense: "Despesa fixa", variable_expense: "Despesa variável" };
const RECURRENCE_LABELS: Record<ExportBudgetItem["recurrence"], string> = { monthly: "mensal", annualized: "anualizado", one_off: "pontual" };

/** Os itens que contam no mês, com a média do cartão e os totais da página Orçamento. */
function budgetSheet(budget: ExportBudget, referenceMonth: string): ExportSheet {
  const itemRows: SheetCell[][] = [];
  for (const kind of BUDGET_KINDS) {
    if (kind === "variable_expense" && budget.card) {
      const months = `${budget.card.months} ${budget.card.months === 1 ? "mês" : "meses"}`;
      itemRows.push([
        KIND_LABELS.variable_expense,
        `Cartão (média ${months})`,
        null,
        money(budget.card.amount),
        budget.card.partial ? "automático · só de quem não tem item de cartão próprio" : "automático · média móvel",
        null,
        null,
      ]);
    }
    const items = budget.items.filter((item) => item.kind === kind).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const item of items) {
      itemRows.push([
        KIND_LABELS[item.kind],
        item.name,
        item.personName ?? "Familiar",
        money(item.amountMonthly),
        RECURRENCE_LABELS[item.recurrence],
        monthCell(item.startMonth),
        item.endMonth ? monthCell(item.endMonth) : null,
      ]);
    }
  }
  const totals: SheetCell[][] = [
    ["Renda total", null, null, money(budget.totals.income)],
    ["Despesas fixas", null, null, money(budget.totals.fixedExpense)],
    ["Variáveis + cartão", null, null, money(budget.totals.variableExpense)],
    ["Sobra planejada", null, null, money(budget.totals.surplus)],
  ];
  return {
    name: "Orçamento",
    rows: [
      BUDGET_HEADER,
      ...itemRows,
      [],
      ...totals,
      [],
      [`Itens que contam em ${displayMonth(referenceMonth)}, com os mesmos totais da página Orçamento.`],
    ],
    // A nota do fim transborda para as colunas vazias ao lado: não entra na largura.
    widths: columnWidths([BUDGET_HEADER, ...itemRows, ...totals]),
    filterRows: itemRows.length + 1,
  };
}

const GOAL_HEADER = [
  "Horizonte",
  "Meta",
  "Valor atual",
  "Alvo",
  "Progresso",
  "Situação",
  "Prazo",
  "Crescimento anual necessário",
  "Origem do progresso",
  "Descrição",
];
const HORIZONS: ExportGoal["horizon"][] = ["short", "medium", "long"];
const HORIZON_LABELS: Record<ExportGoal["horizon"], string> = { short: "Curto prazo", medium: "Médio prazo", long: "Longo prazo" };

// Mesmas regras da tela de metas (goal-manager.tsx): formato de cada métrica,
// selo de situação, origem do progresso e notas que só repetem o status.
const PERCENT_METRICS = new Set(["invest_ativos", "divida_ativos", "tx_poupanca"]);
const MONEY_METRICS = new Set(["pl_total", "invest_total", "caixa_total"]);
const SOURCE_LABELS: Record<ExportGoal["progressSource"], string> = {
  calculated: "Calculado pelo app",
  manual: "Progresso manual",
  empty: "Sem progresso registrado",
};
const STATUS_MARKER = /^[\s⚠️✅❌⏳🔴🟡🟢]*(Em progresso|Atingido|Atingida|Atenç[aã]o|Longo prazo)\s*$/u;

function goalValue(metricKey: string, numeric: number | null, raw: string | null): SheetCell {
  // Sem número (ex.: "Level II"), vai o texto como foi informado.
  if (numeric === null || !Number.isFinite(numeric)) return raw && raw.trim() !== "" ? raw : null;
  if (PERCENT_METRICS.has(metricKey)) return percent(numeric);
  if (MONEY_METRICS.has(metricKey)) return money(numeric);
  if (metricKey === "meses_de_reserva") return { value: numeric, format: XLSX_FORMATS.months };
  return { value: numeric, format: Number.isInteger(numeric) ? XLSX_FORMATS.integer : XLSX_FORMATS.general };
}

function goalSituation(goal: ExportGoal) {
  if (goal.status === "achieved") return "Atingida";
  if (goal.status === "attention") return "Atenção";
  if (goal.status === "long_term") return "Longo prazo";
  return goal.progressPct >= 0.75 ? "Quase lá" : "Em progresso";
}

function goalDeadline(targetDate: string | null): SheetCell {
  if (!targetDate) return null;
  return /^\d{4}-\d{2}/.test(targetDate) ? monthCell(targetDate.slice(0, 7)) : targetDate;
}

/** Metas por horizonte com o progresso no mês de referência, como na página Metas. */
function goalsSheet(goals: ExportGoal[], referenceMonth: string): ExportSheet {
  const ordered = HORIZONS.flatMap((horizon) => goals.filter((goal) => goal.horizon === horizon));
  const rows = ordered.map((goal): SheetCell[] => [
    HORIZON_LABELS[goal.horizon],
    goal.title,
    goalValue(goal.metricKey, goal.currentNumeric, goal.currentValue),
    goalValue(goal.metricKey, goal.targetNumeric, goal.targetValue),
    { value: goal.progressPct, format: XLSX_FORMATS.progress },
    goalSituation(goal),
    goalDeadline(goal.targetDate),
    goal.requiredCagr === null ? null : percent(goal.requiredCagr),
    SOURCE_LABELS[goal.progressSource],
    goal.notes && !STATUS_MARKER.test(goal.notes) ? goal.notes : null,
  ]);
  return {
    name: "Metas",
    rows: [GOAL_HEADER, ...rows, [], [`Progresso em ${displayMonth(referenceMonth)}, como na página Metas.`]],
    widths: columnWidths([GOAL_HEADER, ...rows]),
    filterRows: rows.length + 1,
  };
}
