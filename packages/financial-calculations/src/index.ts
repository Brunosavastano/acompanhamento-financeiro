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
  invoiceMonth: string | Date;
  paymentMonth: string | Date;
  amount: MoneyLike;
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

  for (const expense of expenses) {
    const month = normalizeMonth(expense.periodMonth);
    if (month < windowStartMonth || month > windowEndMonth) continue;
    totalsByMonth.set(month, (totalsByMonth.get(month) ?? ZERO).plus(decimal(expense.amount)));
  }

  const monthlyTotals = [...totalsByMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, amount]) => ({ periodMonth: month, amount }));
  const total = monthlyTotals.reduce((sum, row) => sum.plus(row.amount), ZERO);
  const monthsUsed = monthlyTotals.length;
  const averageMonthly = monthsUsed === 0 ? ZERO : total.div(monthsUsed);

  return {
    averageMonthly,
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
  const shouldApplyCardMovingAverage = input.applyCardMovingAverage ?? !input.items.some((item) => isCardBudgetItem(item, period));
  const cardMovingAverageExpense = cardAverage.averageMonthly;
  const cardMovingAverageAppliedExpense = shouldApplyCardMovingAverage ? cardMovingAverageExpense : ZERO;
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
    cardMovingAverageApplied: shouldApplyCardMovingAverage && cardMovingAverageExpense.gt(0),
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

export function isCardBudgetItem(item: BudgetItemInput, periodMonth: string): boolean {
  if (item.kind !== "variable_expense") return false;
  if (item.isActive === false) return false;
  if (!isBudgetItemActive(item, periodMonth)) return false;
  const normalizedName = normalizeSearchText(item.name ?? "");
  return normalizedName.includes("cartao") || normalizedName.includes("fatura");
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function calculatePatrimonyMetrics(input: {
  positions: PositionInput[];
  debtPvTotal: MoneyLike;
  previousNetWorth?: MoneyLike | null;
  incomeTotal: MoneyLike;
  expenseTotal: MoneyLike;
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
    patrimonialSavingsRate: safeRatio(monthlyVariation, input.incomeTotal),
    budgetSavingsRate: safeRatio(budgetSavings, input.incomeTotal),
  };
}

export function calculateGoalProgress(goal: GoalInput): Decimal {
  if (goal.comparisonOperator === "manual") {
    const manual = decimal(goal.currentValue as MoneyLike);
    return Decimal.max(ZERO, Decimal.min(manual, 1));
  }

  const current = decimal(goal.currentValue as MoneyLike);
  const target = decimal(goal.targetValue as MoneyLike);
  if (target.isZero()) return ZERO;

  if (goal.comparisonOperator === "greater_or_equal") {
    return Decimal.max(ZERO, Decimal.min(current.div(target), 1));
  }

  if (goal.comparisonOperator === "less_or_equal") {
    if (current.lessThanOrEqualTo(target)) return new Decimal(1);
    const riskCap = goal.riskCapValue ? decimal(goal.riskCapValue) : target.times(2);
    if (riskCap.lessThanOrEqualTo(target)) return ZERO;
    return Decimal.max(ZERO, new Decimal(1).minus(current.minus(target).div(riskCap.minus(target))));
  }

  return current.equals(target) ? new Decimal(1) : ZERO;
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
