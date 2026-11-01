import { Decimal } from "decimal.js";

export type MoneyLike = Decimal.Value;

export type PositionCategory = "cash" | "benefit" | "investment" | "cashback";

export type PositionInput = {
  personId: string;
  category: PositionCategory;
  amount: MoneyLike;
};

export type DebtCashflowInput = {
  personId: string;
  cardName?: string | null;
  invoiceMonth: string | Date;
  paymentMonth: string | Date;
  amount: MoneyLike;
  /** "purchase" marca parcela avulsa aditiva; demais fontes são declarações de total. */
  source?: string | null;
};

export type BudgetItemInput = {
  personId?: string | null;
  name?: string | null;
  kind: "income" | "fixed_expense" | "variable_expense";
  amountMonthly: MoneyLike;
  recurrence?: "monthly" | "annualized" | "one_off";
  startMonth?: string | Date | null;
  endMonth?: string | Date | null;
  isActive?: boolean;
};

export type MovingAverageExpenseInput = {
  periodMonth: string | Date;
  amount: MoneyLike;
  /** Dono do gasto: a média é calculada por pessoa e depois somada, como na planilha. */
  personId?: string | null;
};

export type PatrimonyMetrics = {
  cashTotal: Decimal;
  investmentsTotal: Decimal;
  assetsTotal: Decimal;
  debtPvTotal: Decimal;
  netWorth: Decimal;
  monthlyVariation: Decimal;
  monthlyVariationPct: Decimal;
  debtToAssets: Decimal;
  reserveMonths: Decimal;
  investmentsToAssets: Decimal;
  patrimonialSavingsRate: Decimal;
  budgetSavingsRate: Decimal;
};

export type DebtMetrics = {
  nominalTotal: Decimal;
  presentValueTotal: Decimal;
  floatGain: Decimal;
  monthlyInvoiceTotal: Decimal;
  byPerson: Record<string, {
    nominalTotal: Decimal;
    presentValueTotal: Decimal;
    floatGain: Decimal;
    monthlyInvoiceTotal: Decimal;
  }>;
};

export type MonthlyInvoiceMetrics = {
  monthlyInvoiceTotal: Decimal;
  byPerson: Record<string, Decimal>;
};

export type BudgetMetrics = {
  incomeTotal: Decimal;
  fixedExpenseTotal: Decimal;
  variableExpenseTotal: Decimal;
  expenseTotal: Decimal;
  monthlySurplus: Decimal;
  annualizedSurplus: Decimal;
  incomeCommitment: Decimal;
  budgetSavingsRate: Decimal;
};

export type MovingAverageExpenseMetrics = {
  averageMonthly: Decimal;
  /** Média de cada pessoa (chave "" quando o gasto não tem dono). */
  averageByPerson: Record<string, Decimal>;
  total: Decimal;
  monthsUsed: number;
  windowStartMonth: string;
  windowEndMonth: string;
  monthlyTotals: Array<{ periodMonth: string; amount: Decimal }>;
};

export type BudgetProjectionMetrics = BudgetMetrics & {
  budgetItemVariableExpenseTotal: Decimal;
  cardMovingAverageExpense: Decimal;
  cardMovingAverageAppliedExpense: Decimal;
  cardMovingAverageApplied: boolean;
  cardMovingAverageMonths: number;
  cardMovingAverageWindowStartMonth: string;
  cardMovingAverageWindowEndMonth: string;
  cardMonthlyTotals: Array<{ periodMonth: string; amount: Decimal }>;
};

export type GoalInput = {
  currentValue: MoneyLike | string | null;
  targetValue: MoneyLike | string | null;
  comparisonOperator: "greater_or_equal" | "less_or_equal" | "equals" | "manual";
  riskCapValue?: MoneyLike | null;
};

export const ZERO = new Decimal(0);

export function decimal(value: MoneyLike | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  return new Decimal(value);
}

export function roundMoney(value: MoneyLike): Decimal {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function safeRatio(numerator: MoneyLike, denominator: MoneyLike): Decimal {
  const den = decimal(denominator);
  if (den.isZero()) return ZERO;
  return decimal(numerator).div(den);
}

export function normalizeMonth(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid month: ${String(input)}`);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function monthDiff(from: string | Date, to: string | Date): number {
  const start = new Date(normalizeMonth(from));
  const end = new Date(normalizeMonth(to));
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
}

export function addMonths(month: string | Date, months: number): string {
  const normalized = new Date(normalizeMonth(month));
  const date = new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() + months, 1));
  return normalizeMonth(date);
}

export function annualToMonthlyRate(annualRate: MoneyLike): Decimal {
  return decimal(annualRate).plus(1).pow(new Decimal(1).div(12)).minus(1);
}

export function presentValue(amount: MoneyLike, monthsUntilPayment: number, annualRate: MoneyLike): Decimal {
  if (monthsUntilPayment < 0) {
    throw new Error("paymentMonth cannot be before invoiceMonth");
  }
  const monthlyRate = annualToMonthlyRate(annualRate);
  return decimal(amount).div(monthlyRate.plus(1).pow(monthsUntilPayment));
}

export function calculateDebtMetrics(
  cashflows: DebtCashflowInput[],
  annualRate: MoneyLike,
  periodMonth: string | Date,
): DebtMetrics {
  const targetMonth = normalizeMonth(periodMonth);
  const byPerson: DebtMetrics["byPerson"] = {};
  let nominalTotal = ZERO;
  let presentValueTotal = ZERO;
  let monthlyInvoiceTotal = ZERO;

  for (const flow of cashflows) {
    const invoiceMonth = normalizeMonth(flow.invoiceMonth);
    const paymentMonth = normalizeMonth(flow.paymentMonth);
    const months = monthDiff(invoiceMonth, paymentMonth);
    if (months < 0) {
      throw new Error(`Invalid debt cashflow: ${paymentMonth} before ${invoiceMonth}`);
    }

    const amount = decimal(flow.amount);
    const pv = presentValue(amount, months, annualRate);
    nominalTotal = nominalTotal.plus(amount);
    presentValueTotal = presentValueTotal.plus(pv);

    byPerson[flow.personId] ??= {
      nominalTotal: ZERO,
      presentValueTotal: ZERO,
      floatGain: ZERO,
      monthlyInvoiceTotal: ZERO,
    };
    byPerson[flow.personId].nominalTotal = byPerson[flow.personId].nominalTotal.plus(amount);
    byPerson[flow.personId].presentValueTotal = byPerson[flow.personId].presentValueTotal.plus(pv);

    if (paymentMonth === targetMonth) {
      monthlyInvoiceTotal = monthlyInvoiceTotal.plus(amount);
      byPerson[flow.personId].monthlyInvoiceTotal = byPerson[flow.personId].monthlyInvoiceTotal.plus(amount);
    }
  }

  const floatGain = nominalTotal.minus(presentValueTotal);
  for (const personMetrics of Object.values(byPerson)) {
    personMetrics.floatGain = personMetrics.nominalTotal.minus(personMetrics.presentValueTotal);
  }

  return {
    nominalTotal,
    presentValueTotal,
    floatGain,
    monthlyInvoiceTotal,
    byPerson,
  };
}

/**
 * "A base mais recente vence": para cada (pessoa, cartão, mês de vencimento),
 * mantém apenas os fluxos declarados na base (`invoiceMonth`) mais nova.
 *
 * Isso permite que parcelas antigas nunca re-declaradas continuem contando,
 * enquanto re-declarações mensais da projeção da fatura (o fluxo real de uso)
 * substituem as projeções de bases anteriores em vez de somar com elas.
 */
export function dedupeLatestInvoiceBase<T extends DebtCashflowInput>(cashflows: T[]): T[] {
  // Parcela avulsa é aditiva por natureza: não compete como "declaração da
  // base" nem evicta declarações anteriores — sem isso, uma avulsa numa base
  // mais nova apagaria das métricas a projeção inteira do mês anterior.
  const isAdditive = (flow: T) => flow.source === "purchase";
  const keyOf = (flow: T) => JSON.stringify([flow.personId, cardKey(flow.cardName), normalizeMonth(flow.paymentMonth)]);

  const latestBaseByKey = new Map<string, string>();
  for (const flow of cashflows) {
    if (isAdditive(flow)) continue;
    const key = keyOf(flow);
    const base = normalizeMonth(flow.invoiceMonth);
    const current = latestBaseByKey.get(key);
    if (!current || base > current) latestBaseByKey.set(key, base);
  }
  return cashflows.filter((flow) => isAdditive(flow) || latestBaseByKey.get(keyOf(flow)) === normalizeMonth(flow.invoiceMonth));
}

/**
 * Identidade do cartão para comparação: ignora acento, caixa e espaços.
 * Dados importados por versões antigas gravaram "Cartao principal" (sem til)
 * e a UI grava "Cartão principal" — os dois são o MESMO cartão.
 */
export function cardKey(name: string | null | undefined): string {
  return normalizeSearchText(name ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Fatura REALIZADA de cada mês: apenas o que foi declarado na própria base
 * (invoiceMonth == paymentMonth) — a "fatura atual" informada ao fechar o mês.
 * É a mesma regra da planilha (linha "Fatura do mês" da aba Dívidas). Projeções
 * feitas em bases anteriores não entram: subestimam o gasto (compras feitas
 * depois ainda não aparecem) e contariam em dobro com a declaração do próprio
 * mês. Meses sem declaração própria ficam de fora da média, como o AVERAGEIF
 * "<>0" da planilha.
 */
export function realizedInvoiceExpenses(cashflows: DebtCashflowInput[]): MovingAverageExpenseInput[] {
  return cashflows
    .filter((flow) => normalizeMonth(flow.invoiceMonth) === normalizeMonth(flow.paymentMonth))
    .map((flow) => ({ personId: flow.personId, periodMonth: flow.paymentMonth, amount: flow.amount }));
}

export function calculateMonthlyInvoiceMetrics(cashflows: DebtCashflowInput[], periodMonth: string | Date): MonthlyInvoiceMetrics {
  const targetMonth = normalizeMonth(periodMonth);
  const byPerson: MonthlyInvoiceMetrics["byPerson"] = {};
  let monthlyInvoiceTotal = ZERO;

  for (const flow of cashflows) {
    const invoiceMonth = normalizeMonth(flow.invoiceMonth);
    const paymentMonth = normalizeMonth(flow.paymentMonth);
    if (monthDiff(invoiceMonth, paymentMonth) < 0) {
      throw new Error(`Invalid debt cashflow: ${paymentMonth} before ${invoiceMonth}`);
    }
    if (paymentMonth !== targetMonth) continue;

    const amount = decimal(flow.amount);
    monthlyInvoiceTotal = monthlyInvoiceTotal.plus(amount);
    byPerson[flow.personId] = (byPerson[flow.personId] ?? ZERO).plus(amount);
  }

  return { monthlyInvoiceTotal, byPerson };
}

export type DebtEvolutionPersonMonth = {
  /** Total a pagar declarado na base do mês (soma das parcelas); null se a pessoa não declarou. */
  outstanding: Decimal | null;
  /** Fatura que vence no mês (base mais recente vence); null sem nenhuma informação. */
  invoice: Decimal | null;
  /** A fatura veio de uma declaração anterior: o mês não teve declaração própria. */
  invoiceProjected: boolean;
  /** Média das faturas realizadas na janela até o mês, ignorando meses zerados. */
  averageInvoice: Decimal | null;
  /** Parcelas que venceram desde o mês anterior da lista, pela declaração anterior. */
  paidSincePrevious: Decimal | null;
  /** Compras novas no cartão desde o mês anterior da lista (líquidas de estornos). */
  newSincePrevious: Decimal | null;
};

export type DebtEvolutionMonth = { month: string; byPerson: Record<string, DebtEvolutionPersonMonth> };

/** Declarações por pessoa → base → vencimento → valor. */
function declarationsByPerson(cashflows: DebtCashflowInput[]) {
  const declared = new Map<string, Map<string, Map<string, Decimal>>>();
  for (const flow of cashflows) {
    const base = normalizeMonth(flow.invoiceMonth);
    const due = normalizeMonth(flow.paymentMonth);
    const byBase = declared.get(flow.personId) ?? new Map<string, Map<string, Decimal>>();
    const byDue = byBase.get(base) ?? new Map<string, Decimal>();
    byDue.set(due, (byDue.get(due) ?? ZERO).plus(decimal(flow.amount)));
    byBase.set(base, byDue);
    declared.set(flow.personId, byBase);
  }
  return declared;
}

function sumDue(byDue: Map<string, Decimal>, from: string, before?: string): Decimal {
  let total = ZERO;
  for (const [due, amount] of byDue) {
    if (due >= from && (before === undefined || due < before)) total = total.plus(amount);
  }
  return total;
}

/**
 * Evolução das dívidas de cartão nos meses informados. O total a pagar de cada
 * mês é a declaração da própria base (a mesma que entra no patrimônio). Entre
 * dois meses da lista vale a ponte: total(b) = total(a) − parcelas que venceram
 * no intervalo + compras novas.
 */
export function calculateDebtEvolution(
  cashflows: DebtCashflowInput[],
  months: Array<string | Date>,
  windowMonths = 12,
): DebtEvolutionMonth[] {
  const sortedMonths = [...new Set(months.map(normalizeMonth))].sort();
  const declared = declarationsByPerson(cashflows);
  const deduped = dedupeLatestInvoiceBase(cashflows);
  const realized = realizedInvoiceExpenses(cashflows);

  return sortedMonths.map((month, index) => {
    const previous = index > 0 ? sortedMonths[index - 1] : null;
    const invoices = calculateMonthlyInvoiceMetrics(deduped, month);
    const averages = calculateMovingAverageExpense(realized, month, windowMonths).averageByPerson;
    const byPerson: Record<string, DebtEvolutionPersonMonth> = {};

    for (const [personId, bases] of declared) {
      const current = bases.get(month);
      const before = previous ? bases.get(previous) : undefined;
      const outstanding = current ? sumDue(current, month) : null;
      const invoice = invoices.byPerson[personId] ?? (current ? ZERO : null);
      const bridge = outstanding !== null && before && previous ? { paid: sumDue(before, previous, month), remaining: sumDue(before, month) } : null;
      byPerson[personId] = {
        outstanding,
        invoice,
        invoiceProjected: invoice !== null && !current,
        averageInvoice: averages[personId] ?? null,
        paidSincePrevious: bridge ? bridge.paid : null,
        newSincePrevious: bridge && outstanding !== null ? outstanding.minus(bridge.remaining) : null,
      };
    }
    return { month, byPerson };
  });
}

export type DebtOutlook = {
  asOfMonth: string;
  byPerson: Record<string, { baseMonth: string; schedule: Array<{ month: string; amount: Decimal }> }>;
};

/** Parcelas a vencer a partir do mês, pela declaração mais recente de cada pessoa até ele. */
export function calculateDebtOutlook(cashflows: DebtCashflowInput[], asOfMonth: string | Date): DebtOutlook {
  const asOf = normalizeMonth(asOfMonth);
  const byPerson: DebtOutlook["byPerson"] = {};
  for (const [personId, bases] of declarationsByPerson(cashflows)) {
    const candidates = [...bases.keys()].filter((base) => base <= asOf).sort();
    const baseMonth = candidates[candidates.length - 1];
    if (!baseMonth) continue;
    const schedule = [...bases.get(baseMonth)!.entries()]
      .filter(([due, amount]) => due >= asOf && !amount.isZero())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
    byPerson[personId] = { baseMonth, schedule };
  }
  return { asOfMonth: asOf, byPerson };
}

export function calculateBudgetMetrics(items: BudgetItemInput[], periodMonth: string | Date): BudgetMetrics {
  const period = normalizeMonth(periodMonth);
  let incomeTotal = ZERO;
  let fixedExpenseTotal = ZERO;
  let variableExpenseTotal = ZERO;

  for (const item of items) {
    if (item.isActive === false) continue;
    if (!isBudgetItemActive(item, period)) continue;
    const amount = decimal(item.amountMonthly);
    if (item.kind === "income") incomeTotal = incomeTotal.plus(amount);
    if (item.kind === "fixed_expense") fixedExpenseTotal = fixedExpenseTotal.plus(amount);
    if (item.kind === "variable_expense") variableExpenseTotal = variableExpenseTotal.plus(amount);
  }

  const expenseTotal = fixedExpenseTotal.plus(variableExpenseTotal);
  const monthlySurplus = incomeTotal.minus(expenseTotal);
  return {
    incomeTotal,
    fixedExpenseTotal,
    variableExpenseTotal,
    expenseTotal,
    monthlySurplus,
    annualizedSurplus: monthlySurplus.times(12),
    incomeCommitment: safeRatio(expenseTotal, incomeTotal),
    budgetSavingsRate: safeRatio(monthlySurplus, incomeTotal),
  };
}

export function calculateMovingAverageExpense(
  expenses: MovingAverageExpenseInput[],
  periodMonth: string | Date,
  maxMonths = 12,
): MovingAverageExpenseMetrics {
  const safeMaxMonths = Math.max(1, Math.floor(maxMonths));
  const windowEndMonth = normalizeMonth(periodMonth);
  const windowStartMonth = addMonths(windowEndMonth, -(safeMaxMonths - 1));
  const totalsByMonth = new Map<string, Decimal>();
  const totalsByPersonMonth = new Map<string, Map<string, Decimal>>();

  for (const expense of expenses) {
    const month = normalizeMonth(expense.periodMonth);
    if (month < windowStartMonth || month > windowEndMonth) continue;
    const amount = decimal(expense.amount);
    totalsByMonth.set(month, (totalsByMonth.get(month) ?? ZERO).plus(amount));
    const person = expense.personId ?? "";
    const personMonths = totalsByPersonMonth.get(person) ?? new Map<string, Decimal>();
    personMonths.set(month, (personMonths.get(month) ?? ZERO).plus(amount));
    totalsByPersonMonth.set(person, personMonths);
  }

  const monthlyTotals = [...totalsByMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, amount]) => ({ periodMonth: month, amount }));
  const total = monthlyTotals.reduce((sum, row) => sum.plus(row.amount), ZERO);
  const monthsUsed = monthlyTotals.filter((row) => !row.amount.isZero()).length;
  // Média de cada pessoa só sobre os meses em que ELA teve fatura (AVERAGEIF
  // "<>0" da planilha), somadas no fim (E31 = C31 + D31). Um mês sem a fatura
  // de uma pessoa não dilui a média dela com um zero.
  let averageMonthly = ZERO;
  const averageByPerson: Record<string, Decimal> = {};
  for (const [person, personMonths] of totalsByPersonMonth) {
    const nonZero = [...personMonths.values()].filter((amount) => !amount.isZero());
    if (nonZero.length === 0) continue;
    averageByPerson[person] = nonZero.reduce((sum, amount) => sum.plus(amount), ZERO).div(nonZero.length);
    averageMonthly = averageMonthly.plus(averageByPerson[person]);
  }

  return {
    averageMonthly,
    averageByPerson,
    total,
    monthsUsed,
    windowStartMonth,
    windowEndMonth,
    monthlyTotals,
  };
}

export function calculateBudgetProjection(input: {
  items: BudgetItemInput[];
  periodMonth: string | Date;
  cardExpenses?: MovingAverageExpenseInput[];
  cardWindowMonths?: number;
  applyCardMovingAverage?: boolean;
}): BudgetProjectionMetrics {
  const baseMetrics = calculateBudgetMetrics(input.items, input.periodMonth);
  const cardAverage = calculateMovingAverageExpense(input.cardExpenses ?? [], input.periodMonth, input.cardWindowMonths ?? 12);
  const period = normalizeMonth(input.periodMonth);
  const cardMovingAverageExpense = cardAverage.averageMonthly;
  const cardMovingAverageAppliedExpense = appliedCardAverage(input.items, period, cardAverage, input.applyCardMovingAverage);
  const variableExpenseTotal = baseMetrics.variableExpenseTotal.plus(cardMovingAverageAppliedExpense);
  const expenseTotal = baseMetrics.fixedExpenseTotal.plus(variableExpenseTotal);
  const monthlySurplus = baseMetrics.incomeTotal.minus(expenseTotal);

  return {
    incomeTotal: baseMetrics.incomeTotal,
    fixedExpenseTotal: baseMetrics.fixedExpenseTotal,
    variableExpenseTotal,
    expenseTotal,
    monthlySurplus,
    annualizedSurplus: monthlySurplus.times(12),
    incomeCommitment: safeRatio(expenseTotal, baseMetrics.incomeTotal),
    budgetSavingsRate: safeRatio(monthlySurplus, baseMetrics.incomeTotal),
    budgetItemVariableExpenseTotal: baseMetrics.variableExpenseTotal,
    cardMovingAverageExpense,
    cardMovingAverageAppliedExpense,
    cardMovingAverageApplied: cardMovingAverageAppliedExpense.gt(0),
    cardMovingAverageMonths: cardAverage.monthsUsed,
    cardMovingAverageWindowStartMonth: cardAverage.windowStartMonth,
    cardMovingAverageWindowEndMonth: cardAverage.windowEndMonth,
    cardMonthlyTotals: cardAverage.monthlyTotals,
  };
}

export function isBudgetItemActive(item: BudgetItemInput, periodMonth: string): boolean {
  const start = item.startMonth ? normalizeMonth(item.startMonth) : null;
  const end = item.endMonth ? normalizeMonth(item.endMonth) : null;
  if (item.recurrence === "one_off") return start === periodMonth;
  if (start && periodMonth < start) return false;
  if (end && periodMonth > end) return false;
  return true;
}

/**
 * Média do cartão efetivamente aplicada no orçamento do mês. Um item de
 * orçamento que substitui a fatura cobre a média da SUA pessoa (ou de todos,
 * se for familiar); quem não tem item próprio entra pela média calculada.
 */
function appliedCardAverage(
  items: BudgetItemInput[],
  period: string,
  cardAverage: MovingAverageExpenseMetrics,
  override?: boolean,
): Decimal {
  if (override === true) return cardAverage.averageMonthly;
  if (override === false) return ZERO;
  const cardItems = items.filter((item) => isCardBudgetItem(item, period));
  if (cardItems.some((item) => !item.personId)) return ZERO;
  const covered = new Set(cardItems.map((item) => item.personId));
  return Object.entries(cardAverage.averageByPerson)
    .filter(([person]) => !covered.has(person))
    .reduce((sum, [, average]) => sum.plus(average), ZERO);
}

/**
 * Nome de item que representa a FATURA do cartão (substitui a média): "fatura"
 * ou "cartão" + "média". Uma "Anuidade do cartão" é só uma despesa.
 */
export function isCardInvoiceItemName(name: string | null | undefined): boolean {
  const normalizedName = normalizeSearchText(name ?? "");
  return normalizedName.includes("fatura") || (normalizedName.includes("cartao") && normalizedName.includes("media"));
}

export function isCardBudgetItem(item: BudgetItemInput, periodMonth: string): boolean {
  if (item.kind !== "variable_expense") return false;
  if (item.isActive === false) return false;
  if (!isBudgetItemActive(item, periodMonth)) return false;
  return isCardInvoiceItemName(item.name);
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function calculatePatrimonyMetrics(input: {
  positions: PositionInput[];
  debtPvTotal: MoneyLike;
  previousNetWorth?: MoneyLike | null;
  incomeTotal: MoneyLike;
  expenseTotal: MoneyLike;
  /**
   * Meses entre o fechamento anterior e este (1 = consecutivo). Quando um mês
   * é pulado, a variação cobre mais de um mês de renda: a taxa de poupança
   * patrimonial é normalizada por mês para não ser inflada/deflacionada.
   */
  monthsSincePrevious?: number;
}): PatrimonyMetrics {
  let cashTotal = ZERO;
  let investmentsTotal = ZERO;

  for (const position of input.positions) {
    const amount = decimal(position.amount);
    if (position.category === "cash" || position.category === "benefit") cashTotal = cashTotal.plus(amount);
    if (position.category === "investment" || position.category === "cashback") investmentsTotal = investmentsTotal.plus(amount);
  }

  const assetsTotal = cashTotal.plus(investmentsTotal);
  const debtPvTotal = decimal(input.debtPvTotal);
  const netWorth = assetsTotal.minus(debtPvTotal);
  const previousNetWorth = input.previousNetWorth === null || input.previousNetWorth === undefined ? netWorth : decimal(input.previousNetWorth);
  const monthlyVariation = netWorth.minus(previousNetWorth);
  const budgetSavings = decimal(input.incomeTotal).minus(decimal(input.expenseTotal));
  const monthsSincePrevious = Math.max(1, Math.floor(input.monthsSincePrevious ?? 1));

  return {
    cashTotal,
    investmentsTotal,
    assetsTotal,
    debtPvTotal,
    netWorth,
    monthlyVariation,
    monthlyVariationPct: safeRatio(monthlyVariation, previousNetWorth),
    debtToAssets: safeRatio(debtPvTotal, assetsTotal),
    reserveMonths: safeRatio(cashTotal, input.expenseTotal),
    investmentsToAssets: safeRatio(investmentsTotal, assetsTotal),
    patrimonialSavingsRate: safeRatio(monthlyVariation, decimal(input.incomeTotal).times(monthsSincePrevious)),
    budgetSavingsRate: safeRatio(budgetSavings, input.incomeTotal),
  };
}

/** Decimal a partir de entrada arbitrária, ou null se não for numérica (nunca lança). */
function tryDecimal(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string" && !(value instanceof Decimal)) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function calculateGoalProgress(goal: GoalInput): Decimal {
  // Valores não numéricos (texto livre, "1.000.000" em formato BR) nunca
  // derrubam o cálculo: viram progresso 0. Quem chama deve normalizar antes.
  if (goal.comparisonOperator === "manual") {
    const manual = tryDecimal(goal.currentValue);
    return manual ? Decimal.max(ZERO, Decimal.min(manual, 1)) : ZERO;
  }

  const current = tryDecimal(goal.currentValue);
  const target = tryDecimal(goal.targetValue);
  if (!current || !target || target.isZero()) return ZERO;

  if (goal.comparisonOperator === "greater_or_equal") {
    return Decimal.max(ZERO, Decimal.min(current.div(target), 1));
  }

  if (goal.comparisonOperator === "less_or_equal") {
    if (current.lessThanOrEqualTo(target)) return new Decimal(1);
    const riskCap = tryDecimal(goal.riskCapValue) ?? target.times(2);
    if (riskCap.lessThanOrEqualTo(target)) return ZERO;
    return Decimal.max(ZERO, new Decimal(1).minus(current.minus(target).div(riskCap.minus(target))));
  }

  return current.equals(target) ? new Decimal(1) : ZERO;
}

export type GoalHorizonKey = "short" | "medium" | "long";
export type GoalStatusKey = "achieved" | "in_progress" | "attention" | "long_term";

/**
 * Status por horizonte, nas mesmas faixas da aba Metas da planilha:
 * curto prazo abaixo de 70% pede atenção; médio/longo prazo com pouco
 * progresso é "longo prazo" (não um alarme) — 50% no médio, 10% no longo.
 */
export function goalStatusFor(progress: number, horizon: GoalHorizonKey): GoalStatusKey {
  if (progress >= 1) return "achieved";
  if (horizon === "short") return progress >= 0.7 ? "in_progress" : "attention";
  if (horizon === "medium") return progress >= 0.5 ? "in_progress" : "long_term";
  return progress >= 0.1 ? "in_progress" : "long_term";
}

export function calculateRequiredCagr(currentValue: MoneyLike, targetValue: MoneyLike, yearsRemaining: MoneyLike): Decimal {
  const current = decimal(currentValue);
  const target = decimal(targetValue);
  const years = decimal(yearsRemaining);
  if (current.lte(0) || target.lte(0) || years.lte(0)) return ZERO;
  return target.div(current).pow(new Decimal(1).div(years)).minus(1);
}

export function toNumber(value: Decimal): number {
  return Number(value.toFixed(10));
}

export function toMoneyNumber(value: Decimal): number {
  return Number(roundMoney(value).toFixed(2));
}
