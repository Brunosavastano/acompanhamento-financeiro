import { describe, expect, it } from "vitest";
import { XLSX_FORMATS, buildExportSheets, excelMonth, exportFileName, type ExportGoal, type ExportWorkbookData, type SheetCell } from "./export-workbook";

const money = (value: number) => ({ value, format: XLSX_FORMATS.money });
const percent = (value: number) => ({ value, format: XLSX_FORMATS.percent });
const month = (value: string) => ({ value: excelMonth(value), format: XLSX_FORMATS.month });

const data: ExportWorkbookData = {
  referenceMonth: "2026-11",
  history: [
    {
      month: "2026-09",
      cashTotal: 1500,
      investmentsTotal: 5050,
      assetsTotal: 6550,
      debtPvTotal: 900,
      netWorth: 5650,
      monthlyVariation: 0,
      debtToAssets: 0.1374045802,
      reserveMonths: 0.5,
      patrimonialSavingsRate: 0,
    },
    {
      month: "2026-11",
      cashTotal: 2000,
      investmentsTotal: 5500,
      assetsTotal: 7500,
      debtPvTotal: 700,
      netWorth: 6800,
      monthlyVariation: 1150,
      debtToAssets: 0.0933333333,
      reserveMonths: 0.6666666667,
      patrimonialSavingsRate: 0.115,
    },
  ],
  evolution: {
    people: [
      { id: "b", name: "Bruno" },
      { id: "t", name: "Tatiane" },
    ],
    accounts: [
      { key: "nubank", personId: "b", name: "Nubank", category: "cash", group: "cash" },
      { key: "vr", personId: "b", name: "VR", category: "benefit", group: "cash" },
      { key: "xp", personId: "b", name: "XP", category: "investment", group: "investments" },
      { key: "cashback", personId: "b", name: "Cashback", category: "cashback", group: "investments" },
      { key: "caixa-t", personId: "t", name: "Caixa", category: "cash", group: "cash" },
      { key: "antiga", personId: "t", name: "Conta antiga", category: "investment", group: "investments" },
    ],
    months: [
      { month: "2026-09", balances: { nubank: 1000, vr: 200, xp: 5000, cashback: 50, "caixa-t": 300, antiga: 0 }, debtPv: { b: 800, t: 100.004 }, debtPvTotal: 900 },
      { month: "2026-11", balances: { nubank: 1500, vr: 100, xp: 5500, cashback: 0, "caixa-t": 400 }, debtPv: { b: 700 }, debtPvTotal: 700 },
    ],
  },
  debts: [
    { base: "2026-09", due: "2026-10", personName: "Bruno", cardName: "Cartão principal", amount: 800, description: null },
    { base: "2026-11", due: "2026-12", personName: "Tatiane", cardName: "Cartão principal", amount: 120.5, description: "Parcela do sofá" },
    { base: "2026-11", due: "2026-11", personName: "Bruno", cardName: "Cartão principal", amount: 700, description: "Fatura atual" },
  ],
  budget: {
    items: [
      { kind: "variable_expense", name: "Mercado", personName: null, amountMonthly: 800, recurrence: "monthly", startMonth: "2026-01", endMonth: null },
      { kind: "income", name: "Salário", personName: "Bruno", amountMonthly: 5000, recurrence: "monthly", startMonth: "2026-01", endMonth: null },
      { kind: "fixed_expense", name: "Escola", personName: null, amountMonthly: 1200, recurrence: "annualized", startMonth: "2026-02", endMonth: "2026-12" },
      { kind: "fixed_expense", name: "Aluguel", personName: null, amountMonthly: 2000, recurrence: "monthly", startMonth: "2026-01", endMonth: null },
    ],
    card: { amount: 650, months: 2, partial: false },
    totals: { income: 5000, fixedExpense: 3200, variableExpense: 1450, surplus: 350 },
  },
  goals: [
    {
      title: "Renda 30k",
      horizon: "medium",
      metricKey: "renda_liquida_mensal",
      currentValue: "16500",
      currentNumeric: 16500,
      targetValue: "30000",
      targetNumeric: 30000,
      targetDate: null,
      progressPct: 0.55,
      status: "in_progress",
      progressSource: "manual",
      requiredCagr: null,
      notes: "⚠️ Em progresso",
    },
    {
      title: "Patrimônio de 10 mil",
      horizon: "short",
      metricKey: "pl_total",
      currentValue: "6800",
      currentNumeric: 6800,
      targetValue: "10000",
      targetNumeric: 10000,
      targetDate: "2027-06",
      progressPct: 0.68,
      status: "attention",
      progressSource: "calculated",
      requiredCagr: 0.3612,
      notes: "Somando tudo",
    },
    {
      title: "Reserva de 6 meses",
      horizon: "short",
      metricKey: "meses_de_reserva",
      currentValue: "4,5",
      currentNumeric: 4.5,
      targetValue: "6",
      targetNumeric: 6,
      targetDate: null,
      progressPct: 0.75,
      status: "in_progress",
      progressSource: "calculated",
      requiredCagr: null,
      notes: null,
    },
    {
      title: "Dívida abaixo de 10% dos ativos",
      horizon: "short",
      metricKey: "divida_ativos",
      currentValue: "0,0933",
      currentNumeric: 0.0933,
      targetValue: "0.1",
      targetNumeric: 0.1,
      targetDate: null,
      progressPct: 1,
      status: "achieved",
      progressSource: "calculated",
      requiredCagr: null,
      notes: null,
    },
    {
      title: "CFA",
      horizon: "long",
      metricKey: "cfa",
      currentValue: "Aprovado L2",
      currentNumeric: null,
      targetValue: "Charterholder",
      targetNumeric: null,
      targetDate: "Dez/2030",
      progressPct: 0.33,
      status: "in_progress",
      progressSource: "manual",
      requiredCagr: null,
      notes: null,
    },
  ],
};

function sheet(name: string, input = data) {
  const found = buildExportSheets(input).find((item) => item.name === name);
  if (!found) throw new Error(`Aba ${name} não encontrada`);
  return found;
}

describe("export workbook", () => {
  it("names the file after the reference month and dates months on the Excel calendar", () => {
    expect(exportFileName("2026-10")).toBe("relatorio-financeiro-2026-10.xlsx");
    expect(excelMonth("2026-01")).toBe(46023);
    expect(excelMonth("2026-10")).toBe(46296);
    const sheets = buildExportSheets(data);
    expect(sheets.map((item) => item.name)).toEqual(["Resumo mensal", "Contas mês a mês", "Dívidas do cartão", "Orçamento", "Metas"]);
    // Nenhum número solto: valor numérico sempre leva o formato (moeda, %, mês...).
    const cells: SheetCell[] = sheets.flatMap((item) => item.rows.flat());
    expect(cells.some((cell) => typeof cell === "number")).toBe(false);
    expect(cells.filter((cell) => cell !== null && typeof cell === "object").length).toBeGreaterThan(50);
    // Uma largura por coluna do cabeçalho.
    for (const item of sheets) expect(item.widths).toHaveLength(item.rows[0].length);
  });

  it("summarises each closed month with the dashboard history numbers", () => {
    const summary = sheet("Resumo mensal");
    expect(summary.rows[0]).toEqual([
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
    ]);
    // O primeiro fechamento não tem mês anterior: variação e taxa de poupança em branco, não zero.
    expect(summary.rows[1]).toEqual([
      month("2026-09"),
      money(1500),
      money(5050),
      money(6550),
      money(900),
      money(5650),
      null,
      percent(0.1374045802),
      { value: 0.5, format: XLSX_FORMATS.decimal },
      null,
    ]);
    expect(summary.rows[2][6]).toEqual(money(1150));
    expect(summary.rows[2][9]).toEqual(percent(0.115));
    expect(summary.filterRows).toBe(3);
  });

  it("lays out the month-by-month account table for the family and for each person", () => {
    const accounts = sheet("Contas mês a mês");
    expect(accounts.rows[0]).toEqual(["Pessoa", "Conta", month("2026-09"), month("2026-11")]);
    const family = accounts.rows.slice(1, 13);
    expect(family).toEqual([
      ["Família", "CAIXA"],
      ["Família", "Bruno — Nubank", money(1000), money(1500)],
      ["Família", "Bruno — VR (VR/VA)", money(200), money(100)],
      ["Família", "Tatiane — Caixa", money(300), money(400)],
      ["Família", "Total em caixa", money(1500), money(2000)],
      ["Família", "INVESTIMENTOS"],
      ["Família", "Bruno — XP", money(5000), money(5500)],
      ["Família", "Bruno — Cashback", money(50), money(0)],
      ["Família", "Total investido", money(5050), money(5500)],
      ["Família", "Dívidas do cartão (valor presente)", money(900), money(700)],
      ["Família", "Patrimônio líquido", money(5650), money(6800)],
      ["Família", "Variação no mês", null, money(1150)],
    ]);
    // O patrimônio da família é o mesmo do resumo mensal.
    expect(family[10].slice(2)).toEqual(sheet("Resumo mensal").rows.slice(1).map((row) => row[5]));

    const rowsOf = (person: string) => accounts.rows.filter((row) => row[0] === person).map((row) => row.slice(1));
    expect(rowsOf("Bruno")).toEqual([
      ["CAIXA"],
      ["Nubank", money(1000), money(1500)],
      ["VR (VR/VA)", money(200), money(100)],
      ["Total em caixa", money(1200), money(1600)],
      ["INVESTIMENTOS"],
      ["XP", money(5000), money(5500)],
      ["Cashback", money(50), money(0)],
      ["Total investido", money(5050), money(5500)],
      ["Dívidas do cartão (valor presente)", money(800), money(700)],
      ["Patrimônio líquido", money(5450), money(6400)],
      ["Variação no mês", null, money(950)],
    ]);
    // A conta zerada o período todo não aparece; sem investimentos, não há o grupo.
    expect(rowsOf("Tatiane")).toEqual([
      ["CAIXA"],
      ["Caixa", money(300), money(400)],
      ["Total em caixa", money(300), money(400)],
      ["Dívidas do cartão (valor presente)", money(100), money(0)],
      ["Patrimônio líquido", money(200), money(400)],
      ["Variação no mês", null, money(200)],
    ]);
    // Uma linha em branco separa os blocos.
    expect(accounts.rows[13]).toEqual([]);
    expect(accounts.filterRows).toBe(accounts.rows.length);
  });

  it("lists every card entry from the newest base, with months as dates and amounts as money", () => {
    const debts = sheet("Dívidas do cartão");
    expect(debts.rows).toEqual([
      ["Base", "Vencimento", "Pessoa", "Cartão", "Valor", "Descrição"],
      [month("2026-11"), month("2026-11"), "Bruno", "Cartão principal", money(700), "Fatura atual"],
      [month("2026-11"), month("2026-12"), "Tatiane", "Cartão principal", money(120.5), "Parcela do sofá"],
      [month("2026-09"), month("2026-10"), "Bruno", "Cartão principal", money(800), null],
    ]);
    expect(debts.filterRows).toBe(4);
  });

  it("shows the budget items that count in the month, the card average and the page totals", () => {
    const budget = sheet("Orçamento");
    expect(budget.rows).toEqual([
      ["Tipo", "Item", "Pessoa", "Valor mensal", "Recorrência", "Início", "Fim"],
      ["Entrada", "Salário", "Bruno", money(5000), "mensal", month("2026-01"), null],
      ["Despesa fixa", "Aluguel", "Familiar", money(2000), "mensal", month("2026-01"), null],
      ["Despesa fixa", "Escola", "Familiar", money(1200), "anualizado", month("2026-02"), month("2026-12")],
      ["Despesa variável", "Cartão (média 2 meses)", null, money(650), "automático · média móvel", null, null],
      ["Despesa variável", "Mercado", "Familiar", money(800), "mensal", month("2026-01"), null],
      [],
      ["Renda total", null, null, money(5000)],
      ["Despesas fixas", null, null, money(3200)],
      ["Variáveis + cartão", null, null, money(1450)],
      ["Sobra planejada", null, null, money(350)],
      [],
      ["Itens que contam em novembro de 2026, com os mesmos totais da página Orçamento."],
    ]);
    // O filtro cobre só os itens, não os totais.
    expect(budget.filterRows).toBe(6);

    const partial = sheet("Orçamento", { ...data, budget: { ...data.budget, card: { amount: 300, months: 1, partial: true } } });
    expect(partial.rows[4]).toEqual([
      "Despesa variável",
      "Cartão (média 1 mês)",
      null,
      money(300),
      "automático · só de quem não tem item de cartão próprio",
      null,
      null,
    ]);
    const withoutCard = sheet("Orçamento", { ...data, budget: { ...data.budget, card: null } });
    expect(withoutCard.rows.some((row) => String(row[1] ?? "").startsWith("Cartão"))).toBe(false);
  });

  it("formats each goal like the goals page and keeps text values as text", () => {
    const goals = sheet("Metas");
    expect(goals.rows[0]).toEqual([
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
    ]);
    const progress = (value: number) => ({ value, format: XLSX_FORMATS.progress });
    expect(goals.rows.slice(1, 6)).toEqual([
      [
        "Curto prazo",
        "Patrimônio de 10 mil",
        money(6800),
        money(10000),
        progress(0.68),
        "Atenção",
        month("2027-06"),
        percent(0.3612),
        "Calculado pelo app",
        "Somando tudo",
      ],
      [
        "Curto prazo",
        "Reserva de 6 meses",
        { value: 4.5, format: XLSX_FORMATS.months },
        { value: 6, format: XLSX_FORMATS.months },
        progress(0.75),
        "Quase lá",
        null,
        null,
        "Calculado pelo app",
        null,
      ],
      ["Curto prazo", "Dívida abaixo de 10% dos ativos", percent(0.0933), percent(0.1), progress(1), "Atingida", null, null, "Calculado pelo app", null],
      // Nota que só repete o status (legado da planilha) não vira descrição.
      [
        "Médio prazo",
        "Renda 30k",
        { value: 16500, format: XLSX_FORMATS.integer },
        { value: 30000, format: XLSX_FORMATS.integer },
        progress(0.55),
        "Em progresso",
        null,
        null,
        "Progresso manual",
        null,
      ],
      ["Longo prazo", "CFA", "Aprovado L2", "Charterholder", progress(0.33), "Em progresso", "Dez/2030", null, "Progresso manual", null],
    ]);
    expect(goals.rows.at(-1)).toEqual(["Progresso em novembro de 2026, como na página Metas."]);
    expect(goals.filterRows).toBe(6);
  });

  it("widens each column to fit its longest value, so big amounts never show as ####", () => {
    const billion: ExportGoal = { ...data.goals[1], title: "Bilionário", targetValue: "1000000000", targetNumeric: 1_000_000_000 };
    // "R$ 1.000.000.000,00" tem 19 caracteres.
    expect(sheet("Metas", { ...data, goals: [billion] }).widths[3]).toBeGreaterThanOrEqual(21);
    expect(sheet("Resumo mensal").widths[4]).toBe("Dívidas do cartão (valor presente)".length + 3);
    // A nota no fim do orçamento transborda para as colunas vazias ao lado: não alarga a primeira.
    expect(sheet("Orçamento").widths[0]).toBe("Variáveis + cartão".length + 3);
  });

  it("keeps only headers when no month was closed yet", () => {
    const empty: ExportWorkbookData = {
      ...data,
      history: [],
      evolution: { people: data.evolution.people, accounts: [], months: [] },
      debts: [],
      goals: [],
    };
    expect(sheet("Resumo mensal", empty).rows).toHaveLength(1);
    expect(sheet("Contas mês a mês", empty).rows).toEqual([["Pessoa", "Conta"]]);
    expect(sheet("Dívidas do cartão", empty).rows).toHaveLength(1);
    expect(sheet("Metas", empty).rows[1]).toEqual([]);
  });
});
