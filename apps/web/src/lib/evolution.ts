// Séries da visão geral (evolução do patrimônio e das dívidas) montadas a
// partir dos saldos de cada conta por mês. Funções puras: rodam no cliente
// para trocar pessoa/séries sem nova consulta ao servidor.

export type EvolutionAccount = {
  key: string;
  personId: string;
  name: string;
  category: "cash" | "benefit" | "investment" | "cashback";
  /** Mesmas fronteiras dos cards: VR/VA conta como caixa e cashback como investimento. */
  group: "cash" | "investments";
};

export type EvolutionMonth = {
  month: string;
  /** Saldo de cada conta (soma das linhas) no fechamento do mês. */
  balances: Record<string, number>;
  /** Dívida de cartão a valor presente por pessoa (como entra no patrimônio). */
  debtPv: Record<string, number>;
  /** Total da família arredondado uma vez só (bate com o card de patrimônio). */
  debtPvTotal: number;
};

export type DebtPersonMonth = {
  outstanding: number | null;
  invoice: number | null;
  invoiceProjected: boolean;
  averageInvoice: number | null;
  paidSincePrevious: number | null;
  newSincePrevious: number | null;
};

export type EvolutionData = {
  /** Mês de referência ("AAAA-MM"): o último fechamento incluído. */
  periodMonth: string;
  people: Array<{ id: string; name: string }>;
  accounts: EvolutionAccount[];
  months: EvolutionMonth[];
  debt: {
    months: Array<{ month: string; byPerson: Record<string, DebtPersonMonth> }>;
    outlook: { asOfMonth: string; byPerson: Record<string, { baseMonth: string; schedule: Array<{ month: string; amount: number }> }> };
  };
};

/** "familia" ou o id de uma pessoa. */
export type Scope = string;
export const FAMILY_SCOPE = "familia";

export const SUMMARY_KEYS = ["patrimonio", "caixa", "investimentos", "dividas"] as const;
export type SummaryKey = (typeof SUMMARY_KEYS)[number];

export const SUMMARY_LABELS: Record<SummaryKey, string> = {
  patrimonio: "Patrimônio",
  caixa: "Caixa",
  investimentos: "Investimentos",
  dividas: "Dívidas",
};

export type SummaryRow = { month: string } & Record<SummaryKey, number>;

const round2 = (value: number) => Math.round(value * 100) / 100;

function inScope(scope: Scope, personId: string) {
  return scope === FAMILY_SCOPE || scope === personId;
}

/** Caixa, investimentos, dívidas e patrimônio de cada mês para a pessoa (ou a família). */
export function summaryRows(data: Pick<EvolutionData, "accounts" | "months">, scope: Scope): SummaryRow[] {
  const accounts = data.accounts.filter((account) => inScope(scope, account.personId));
  return data.months.map((row) => {
    let caixa = 0;
    let investimentos = 0;
    for (const account of accounts) {
      const value = row.balances[account.key] ?? 0;
      if (account.group === "cash") caixa += value;
      else investimentos += value;
    }
    const dividas =
      scope === FAMILY_SCOPE
        ? row.debtPvTotal
        : Object.entries(row.debtPv).reduce((sum, [personId, value]) => (personId === scope ? sum + value : sum), 0);
    return {
      month: row.month,
      caixa: round2(caixa),
      investimentos: round2(investimentos),
      dividas: round2(dividas),
      patrimonio: round2(caixa + investimentos - dividas),
    };
  });
}

/** Componentes que podem ser somados numa linha só (o patrimônio já é a soma de tudo). */
export const COMBINABLE_KEYS: SummaryKey[] = ["caixa", "investimentos", "dividas"];

export function combinedValue(row: SummaryRow, keys: SummaryKey[]): number {
  return round2(keys.reduce((sum, key) => (key === "dividas" ? sum - row.dividas : key === "patrimonio" ? sum : sum + row[key]), 0));
}

export function combinedLabel(keys: SummaryKey[]): string {
  const assets = keys.filter((key) => key === "caixa" || key === "investimentos").map((key) => SUMMARY_LABELS[key]);
  const label = assets.join(" + ");
  return keys.includes("dividas") ? `${label || "0"} − Dívidas` : label;
}

export type AccountSeries = {
  account: EvolutionAccount;
  points: Array<{ month: string; value: number }>;
  current: number;
  previous: number | null;
};

/** Evolução de cada conta da pessoa (ou da família), sem as contas zeradas no período. */
export function accountSeries(data: Pick<EvolutionData, "accounts" | "months">, scope: Scope): AccountSeries[] {
  return data.accounts
    .filter((account) => inScope(scope, account.personId))
    .map((account) => {
      const points = data.months.map((row) => ({ month: row.month, value: round2(row.balances[account.key] ?? 0) }));
      return {
        account,
        points,
        current: points.length > 0 ? points[points.length - 1].value : 0,
        previous: points.length > 1 ? points[points.length - 2].value : null,
      };
    })
    .filter((series) => series.points.some((point) => point.value !== 0));
}

/** Meses entre dois "AAAA-MM" (1 para meses seguidos). */
export function monthGap(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export type MonthlyChange = { month: string; value: number; months: number };

/** Quanto o patrimônio mudou de um fechamento para o seguinte (um mês não fechado faz o intervalo valer 2 meses). */
export function monthlyChanges(rows: SummaryRow[]): MonthlyChange[] {
  return rows.slice(1).map((row, index) => ({
    month: row.month,
    value: round2(row.patrimonio - rows[index].patrimonio),
    months: Math.max(1, monthGap(rows[index].month, row.month)),
  }));
}

/** Média por mês das últimas `count` variações; um intervalo de 2 meses pesa 2, como no dashboard. */
export function averageMonthlyChange(changes: MonthlyChange[], count = 12): { value: number; months: number } | null {
  const recent = changes.slice(-count);
  const months = recent.reduce((sum, row) => sum + row.months, 0);
  return months > 0 ? { value: recent.reduce((sum, row) => sum + row.value, 0) / months, months } : null;
}

/** Contas, VR/VA e investimentos (com cashback) no último mês, como no painel "De onde vem o patrimônio". */
export function latestComposition(data: Pick<EvolutionData, "accounts" | "months">, scope: Scope) {
  const totals = { cash: 0, benefits: 0, investments: 0 };
  const latest = data.months[data.months.length - 1];
  if (latest) {
    for (const account of data.accounts) {
      if (!inScope(scope, account.personId)) continue;
      const value = latest.balances[account.key] ?? 0;
      if (account.category === "cash") totals.cash += value;
      else if (account.category === "benefit") totals.benefits += value;
      else totals.investments += value;
    }
  }
  return { cash: round2(totals.cash), benefits: round2(totals.benefits), investments: round2(totals.investments) };
}

export type AccountTable = {
  months: string[];
  groups: Array<{ group: EvolutionAccount["group"]; accounts: Array<{ account: EvolutionAccount; values: number[] }>; totals: number[] }>;
  debts: number[];
  netWorth: number[];
  /** Variação do patrimônio em relação ao fechamento anterior (null quando não há mês anterior). */
  changes: Array<number | null>;
};

/** Saldo de cada conta nos últimos `count` meses (todos, sem `count`), com totais por grupo e o patrimônio. */
export function accountTable(data: Pick<EvolutionData, "accounts" | "months">, scope: Scope, count?: number): AccountTable {
  const start = count === undefined ? 0 : Math.max(0, data.months.length - count);
  const summary = summaryRows(data, scope);
  const visible = summary.slice(start);
  const series = accountSeries({ accounts: data.accounts, months: data.months.slice(start) }, scope);
  const groups = (["cash", "investments"] as const)
    .map((group) => ({
      group,
      accounts: series.filter((item) => item.account.group === group).map((item) => ({ account: item.account, values: item.points.map((point) => point.value) })),
      totals: visible.map((row) => (group === "cash" ? row.caixa : row.investimentos)),
    }))
    .filter((group) => group.accounts.length > 0);
  return {
    months: visible.map((row) => row.month),
    groups,
    debts: visible.map((row) => row.dividas),
    netWorth: visible.map((row) => row.patrimonio),
    changes: visible.map((row, index) => (start + index === 0 ? null : round2(row.patrimonio - summary[start + index - 1].patrimonio))),
  };
}

export type DebtRow = {
  month: string;
  outstanding: number | null;
  invoice: number | null;
  invoiceProjected: boolean;
  averageInvoice: number | null;
  paidSincePrevious: number | null;
  newSincePrevious: number | null;
  /** Pessoas do recorte sem declaração no mês (com declaração em algum outro mês). */
  missing: string[];
};

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : round2(present.reduce((sum, value) => sum + value, 0));
}

/** Total a pagar, fatura do mês e média por mês, somando as pessoas do recorte. */
export function debtRows(data: Pick<EvolutionData, "debt">, scope: Scope): DebtRow[] {
  return data.debt.months.map((row) => {
    const people = Object.entries(row.byPerson).filter(([personId]) => inScope(scope, personId));
    const values = people.map(([, value]) => value);
    return {
      month: row.month,
      outstanding: sumNullable(values.map((value) => value.outstanding)),
      invoice: sumNullable(values.map((value) => value.invoice)),
      invoiceProjected: values.some((value) => value.invoiceProjected),
      averageInvoice: sumNullable(values.map((value) => value.averageInvoice)),
      paidSincePrevious: sumNullable(values.map((value) => value.paidSincePrevious)),
      newSincePrevious: sumNullable(values.map((value) => value.newSincePrevious)),
      missing: people.filter(([, value]) => value.outstanding === null).map(([personId]) => personId),
    };
  });
}

/** O que mudou no cartão entre dois fechamentos seguidos da lista: total(b) = total(a) − venceu + compras novas. */
export type DebtBridge = { previousMonth: string; paid: number; added: number; from: number; to: number };

/**
 * Ponte entre o fechamento anterior e o atual (o "venceram X / compras novas Y"
 * do painel de dívidas). `null` quando falta a declaração de alguém do recorte
 * em um dos dois meses: a conta ficaria incompleta.
 */
export function debtBridge(current: DebtRow | undefined, previous: DebtRow | null): DebtBridge | null {
  if (!current || !previous || current.missing.length > 0 || previous.missing.length > 0) return null;
  if (previous.outstanding === null || current.outstanding === null) return null;
  if (current.paidSincePrevious === null || current.newSincePrevious === null) return null;
  return {
    previousMonth: previous.month,
    paid: current.paidSincePrevious,
    added: current.newSincePrevious,
    from: previous.outstanding,
    to: current.outstanding,
  };
}

/** Até 5% de diferença, a fatura do mês está "na média". */
export const INVOICE_ON_AVERAGE_TOLERANCE = 0.05;

export type InvoiceComparison = { month: string; invoice: number; average: number; ratio: number; projected: boolean };

/** Fatura do mês contra a média dos últimos 12 meses; `ratio` = 0,23 quer dizer 23% acima. */
export function invoiceComparison(current: DebtRow | undefined): InvoiceComparison | null {
  if (!current || current.invoice === null || current.averageInvoice === null || current.averageInvoice <= 0) return null;
  return {
    month: current.month,
    invoice: current.invoice,
    average: current.averageInvoice,
    ratio: current.invoice / current.averageInvoice - 1,
    projected: current.invoiceProjected,
  };
}

export type OutlookRow = { month: string; amount: number; remainingAfter: number };

/** Parcelas a vencer por mês e quanto ainda falta pagar depois de cada uma. */
export function outlookRows(data: Pick<EvolutionData, "debt">, scope: Scope): OutlookRow[] {
  const totals = new Map<string, number>();
  for (const [personId, value] of Object.entries(data.debt.outlook.byPerson)) {
    if (!inScope(scope, personId)) continue;
    for (const item of value.schedule) totals.set(item.month, (totals.get(item.month) ?? 0) + item.amount);
  }
  const rows = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  let remaining = rows.reduce((sum, [, amount]) => sum + amount, 0);
  return rows.map(([month, amount]) => {
    remaining -= amount;
    return { month, amount: round2(amount), remainingAfter: round2(Math.max(remaining, 0)) };
  });
}
