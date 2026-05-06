import type { BudgetItem, Prisma, SnapshotStatus } from "@prisma/client";
import {
  addMonths,
  calculateBudgetProjection,
  calculateDebtMetrics,
  calculateGoalProgress,
  calculateMonthlyInvoiceMetrics,
  calculatePatrimonyMetrics,
  calculateRequiredCagr,
  monthDiff,
  toMoneyNumber,
  toNumber,
} from "@finance/financial-calculations";
import { prisma } from "@/lib/prisma";
import { asMonthStart, formatPeriod, parseMonthOrNull } from "@/lib/date";
import { toDecimalNumber } from "@/lib/format";
import { visibleGoalWhere } from "@/server/goal-scope";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

const dashboardSnapshotStatuses: SnapshotStatus[] = ["closed", "revised"];

export async function getLatestSnapshot(householdId: string) {
  return prisma.monthlySnapshot.findFirst({
    where: { householdId, status: { in: dashboardSnapshotStatuses } },
    orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
  });
}

export async function getDashboardData(householdId: string, periodMonth?: string) {
  const snapshot =
    periodMonth
      ? await prisma.monthlySnapshot.findFirst({
          where: { householdId, periodMonth: asMonthStart(periodMonth), status: { in: dashboardSnapshotStatuses } },
          orderBy: { revisionNumber: "desc" },
        })
      : await getLatestSnapshot(householdId);

  if (!snapshot) {
    return {
      hasData: false as const,
      periodMonth: null,
      kpis: null,
      charts: emptyCharts(),
      closestGoals: [],
      people: [],
      availablePeriods: [],
    };
  }

  const [metrics, history, people] = await Promise.all([
    calculateSnapshotMetrics(householdId, snapshot.id),
    getSnapshotHistory(householdId),
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
  ]);
  const goals = await getGoalCards(householdId, snapshot.periodMonth, metricValuesForGoals(metrics));

  return {
    hasData: true as const,
    periodMonth: formatPeriod(snapshot.periodMonth),
    kpis: metrics.kpis,
    debt: metrics.debt,
    budget: metrics.budget,
    charts: {
      netWorthEvolution: history.map((row) => ({ month: row.month, value: row.netWorth })),
      assetComposition: [
        { name: "Caixa", value: metrics.kpis.cashTotal },
        { name: "Investimentos", value: metrics.kpis.investmentsTotal },
        { name: "Dividas PV", value: metrics.kpis.debtPvTotal },
      ],
      monthlyVariation: history.map((row) => ({ month: row.month, value: row.monthlyVariation })),
      assetsVsDebt: history.map((row) => ({ month: row.month, assets: row.assetsTotal, debt: row.debtPvTotal })),
      debtToAssets: history.map((row) => ({ month: row.month, value: row.debtToAssets })),
      reserveMonths: history.map((row) => ({ month: row.month, value: row.reserveMonths })),
    },
    availablePeriods: history.map((row) => ({
      periodMonth: row.periodMonth,
      label: row.month,
      status: row.status,
    })),
    closestGoals: goals,
    people: people.map((person) => ({ id: person.id, name: person.name, role: person.role })),
  };
}

export async function calculateSnapshotMetrics(householdId: string, snapshotId: string) {
  const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({
    where: { id: snapshotId, householdId },
    include: { positions: true },
  });

  const periodMonth = formatPeriod(snapshot.periodMonth);

  const previousSnapshot = await prisma.monthlySnapshot.findFirst({
    where: {
      householdId,
      periodMonth: { lt: snapshot.periodMonth },
      status: { in: ["closed", "revised"] },
    },
    orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
    include: { positions: true },
  });

  const cardWindowStart = asMonthStart(addMonths(snapshot.periodMonth, -11));
  const [budgetItems, debtCashflows, monthlyInvoiceCashflows, cardCashflows] = await Promise.all([
    prisma.budgetItem.findMany({ where: { householdId } }),
    prisma.debtCashflow.findMany({
      where: { householdId, invoiceMonth: snapshot.periodMonth },
    }),
    prisma.debtCashflow.findMany({
      where: { householdId, paymentMonth: snapshot.periodMonth },
    }),
    prisma.debtCashflow.findMany({
      where: {
        householdId,
        paymentMonth: {
          gte: cardWindowStart,
          lte: snapshot.periodMonth,
        },
      },
      select: { paymentMonth: true, amount: true },
    }),
  ]);

  const budget = calculateBudgetProjection({
    items: mapBudgetItemsForCalculation(budgetItems),
    periodMonth,
    cardExpenses: cardCashflows.map((flow) => ({
      periodMonth: flow.paymentMonth,
      amount: toDecimalNumber(flow.amount),
    })),
  });

  const debt = calculateDebtMetrics(
    debtCashflows.map((flow) => ({
      personId: flow.personId,
      invoiceMonth: flow.invoiceMonth,
      paymentMonth: flow.paymentMonth,
      amount: toDecimalNumber(flow.amount),
    })),
    toDecimalNumber(snapshot.selicAnnual),
    periodMonth,
  );
  const monthlyInvoice = calculateMonthlyInvoiceMetrics(
    monthlyInvoiceCashflows.map((flow) => ({
      personId: flow.personId,
      invoiceMonth: flow.invoiceMonth,
      paymentMonth: flow.paymentMonth,
      amount: toDecimalNumber(flow.amount),
    })),
    periodMonth,
  );
  const debtByPersonIds = new Set([...Object.keys(debt.byPerson), ...Object.keys(monthlyInvoice.byPerson)]);

  let previousNetWorth: number | null = null;
  if (previousSnapshot) {
    const previousDebt = await prisma.debtCashflow.findMany({
      where: { householdId, invoiceMonth: previousSnapshot.periodMonth },
    });
    const previousDebtMetrics = calculateDebtMetrics(
      previousDebt.map((flow) => ({
        personId: flow.personId,
        invoiceMonth: flow.invoiceMonth,
        paymentMonth: flow.paymentMonth,
        amount: toDecimalNumber(flow.amount),
      })),
      toDecimalNumber(previousSnapshot.selicAnnual),
      previousSnapshot.periodMonth,
    );
    const previousBudget = await calculateBudgetProjectionForPeriod(householdId, budgetItems, previousSnapshot.periodMonth);
    const previous = calculatePatrimonyMetrics({
      positions: previousSnapshot.positions.map((position) => ({
        personId: position.personId,
        category: position.category,
        amount: toDecimalNumber(position.amount),
      })),
      debtPvTotal: previousDebtMetrics.presentValueTotal,
      previousNetWorth: null,
      incomeTotal: previousBudget.incomeTotal,
      expenseTotal: previousBudget.expenseTotal,
    });
    previousNetWorth = toNumber(previous.netWorth);
  }

  const patrimony = calculatePatrimonyMetrics({
    positions: snapshot.positions.map((position) => ({
      personId: position.personId,
      category: position.category,
      amount: toDecimalNumber(position.amount),
    })),
    debtPvTotal: debt.presentValueTotal,
    previousNetWorth,
    incomeTotal: budget.incomeTotal,
    expenseTotal: budget.expenseTotal,
  });

  return {
    snapshot,
    kpis: {
      netWorth: toMoneyNumber(patrimony.netWorth),
      cashTotal: toMoneyNumber(patrimony.cashTotal),
      investmentsTotal: toMoneyNumber(patrimony.investmentsTotal),
      assetsTotal: toMoneyNumber(patrimony.assetsTotal),
      debtPvTotal: toMoneyNumber(patrimony.debtPvTotal),
      monthlyVariation: toMoneyNumber(patrimony.monthlyVariation),
      monthlyVariationPct: toNumber(patrimony.monthlyVariationPct),
      debtToAssets: toNumber(patrimony.debtToAssets),
      reserveMonths: toNumber(patrimony.reserveMonths),
      investmentsToAssets: toNumber(patrimony.investmentsToAssets),
      patrimonialSavingsRate: toNumber(patrimony.patrimonialSavingsRate),
      budgetSavingsRate: toNumber(patrimony.budgetSavingsRate),
    },
    debt: {
      nominalTotal: toMoneyNumber(debt.nominalTotal),
      presentValueTotal: toMoneyNumber(debt.presentValueTotal),
      floatGain: toMoneyNumber(debt.floatGain),
      monthlyInvoiceTotal: toMoneyNumber(monthlyInvoice.monthlyInvoiceTotal),
      byPerson: Object.fromEntries(
        [...debtByPersonIds].map((personId) => {
          const values = debt.byPerson[personId];
          return [
            personId,
            {
              nominalTotal: toMoneyNumber(values?.nominalTotal ?? 0),
              presentValueTotal: toMoneyNumber(values?.presentValueTotal ?? 0),
              floatGain: toMoneyNumber(values?.floatGain ?? 0),
              monthlyInvoiceTotal: toMoneyNumber(monthlyInvoice.byPerson[personId] ?? 0),
            },
          ];
        }),
      ),
    },
    budget: {
      incomeTotal: toMoneyNumber(budget.incomeTotal),
      fixedExpenseTotal: toMoneyNumber(budget.fixedExpenseTotal),
      variableExpenseTotal: toMoneyNumber(budget.variableExpenseTotal),
      expenseTotal: toMoneyNumber(budget.expenseTotal),
      monthlySurplus: toMoneyNumber(budget.monthlySurplus),
      annualizedSurplus: toMoneyNumber(budget.annualizedSurplus),
      incomeCommitment: toNumber(budget.incomeCommitment),
      budgetSavingsRate: toNumber(budget.budgetSavingsRate),
      budgetItemVariableExpenseTotal: toMoneyNumber(budget.budgetItemVariableExpenseTotal),
      cardMovingAverageExpense: toMoneyNumber(budget.cardMovingAverageExpense),
      cardMovingAverageAppliedExpense: toMoneyNumber(budget.cardMovingAverageAppliedExpense),
      cardMovingAverageApplied: budget.cardMovingAverageApplied,
      cardMovingAverageMonths: budget.cardMovingAverageMonths,
    },
  };
}

export async function getSnapshotHistory(householdId: string) {
  const snapshots = await prisma.monthlySnapshot.findMany({
    where: { householdId, status: { in: dashboardSnapshotStatuses } },
    orderBy: [{ periodMonth: "asc" }, { revisionNumber: "desc" }],
    include: { positions: true },
  });

  const deduped = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const key = formatPeriod(snapshot.periodMonth);
    if (!deduped.has(key)) deduped.set(key, snapshot);
  }

  const rows = [];
  let previousNetWorth: number | null = null;
  const budgetItems = await prisma.budgetItem.findMany({ where: { householdId } });

  for (const snapshot of deduped.values()) {
    const debtCashflows = await prisma.debtCashflow.findMany({
      where: { householdId, invoiceMonth: snapshot.periodMonth },
    });
    const debt = calculateDebtMetrics(
      debtCashflows.map((flow) => ({
        personId: flow.personId,
        invoiceMonth: flow.invoiceMonth,
        paymentMonth: flow.paymentMonth,
        amount: toDecimalNumber(flow.amount),
      })),
      toDecimalNumber(snapshot.selicAnnual),
      snapshot.periodMonth,
    );
    const budget = await calculateBudgetProjectionForPeriod(householdId, budgetItems, snapshot.periodMonth);
    const patrimony = calculatePatrimonyMetrics({
      positions: snapshot.positions.map((position) => ({
        personId: position.personId,
        category: position.category,
        amount: toDecimalNumber(position.amount),
      })),
      debtPvTotal: debt.presentValueTotal,
      previousNetWorth,
      incomeTotal: budget.incomeTotal,
      expenseTotal: budget.expenseTotal,
    });

    const netWorth = toMoneyNumber(patrimony.netWorth);
    previousNetWorth = netWorth;
    rows.push({
      id: snapshot.id,
      month: formatPeriod(snapshot.periodMonth).slice(0, 7),
      periodMonth: formatPeriod(snapshot.periodMonth),
      status: snapshot.status,
      cashTotal: toMoneyNumber(patrimony.cashTotal),
      investmentsTotal: toMoneyNumber(patrimony.investmentsTotal),
      assetsTotal: toMoneyNumber(patrimony.assetsTotal),
      debtPvTotal: toMoneyNumber(patrimony.debtPvTotal),
      netWorth,
      monthlyVariation: toMoneyNumber(patrimony.monthlyVariation),
      debtToAssets: toNumber(patrimony.debtToAssets),
      reserveMonths: toNumber(patrimony.reserveMonths),
      patrimonialSavingsRate: toNumber(patrimony.patrimonialSavingsRate),
    });
  }

  return rows;
}

export async function getGoalRows(householdId: string, periodMonth: Date | string) {
  const snapshot = await prisma.monthlySnapshot.findFirst({
    where: { householdId, periodMonth: asMonthStart(periodMonth) },
    orderBy: { revisionNumber: "desc" },
  });
  const metricValues = snapshot ? metricValuesForGoals(await calculateSnapshotMetrics(householdId, snapshot.id)) : {};
  return getGoalRowsForMetrics(householdId, asMonthStart(periodMonth), metricValues);
}

export async function getGoalCards(householdId: string, periodMonth: Date, metricValues: Record<string, number | string> = {}) {
  const goals = await getGoalRowsForMetrics(householdId, periodMonth, metricValues);
  return goals.sort((a, b) => b.progressPct - a.progressPct).slice(0, 3);
}

async function getGoalRowsForMetrics(householdId: string, periodMonth: Date, metricValues: Record<string, number | string>) {
  const goals = await prisma.goal.findMany({
    where: visibleGoalWhere(householdId),
    include: {
      progressSnapshots: {
        where: { periodMonth },
        take: 1,
      },
    },
    orderBy: [{ horizon: "asc" }, { createdAt: "asc" }],
  });

  return goals
    .map((goal) => {
      const snapshot = goal.progressSnapshots[0];
      const targetValue = goal.targetValueDecimal?.toString() ?? goal.targetValueText ?? null;
      const base = {
        id: goal.id,
        title: goal.title,
        horizon: goal.horizon,
        metricKey: goal.metricKey,
        targetValue,
        targetDate: goal.targetDate,
        comparisonOperator: goal.comparisonOperator,
        riskCapValue: goal.riskCapValue?.toString() ?? null,
        notes: goal.notes,
      };
      if (!snapshot && goal.comparisonOperator !== "manual") {
        const currentValue = metricValues[goal.metricKey] ?? goal.manualCurrentValue ?? "0";
        const progress = calculateGoalProgress({
          currentValue,
          targetValue: targetValue ?? "0",
          comparisonOperator: goal.comparisonOperator,
          riskCapValue: goal.riskCapValue?.toString() ?? null,
        });
        return {
          ...base,
          progressPct: toNumber(progress),
          currentValue: String(currentValue),
          status: progress.gte(1) ? "achieved" : progress.lt(0.5) ? "attention" : "in_progress",
          progressSource: "calculated" as const,
          requiredCagr: requiredGoalCagr(String(currentValue), targetValue, goal.targetDate, periodMonth, goal.comparisonOperator),
        };
      }
      const currentValue = snapshot?.currentValue ?? goal.manualCurrentValue ?? null;
      return {
        ...base,
        progressPct: snapshot ? toDecimalNumber(snapshot.progressPct) : 0,
        currentValue,
        status: snapshot?.status ?? "in_progress",
        progressSource: snapshot ? ("manual" as const) : ("empty" as const),
        requiredCagr: requiredGoalCagr(currentValue, targetValue, goal.targetDate, periodMonth, goal.comparisonOperator),
      };
    });
}

function metricValuesForGoals(metrics: Awaited<ReturnType<typeof calculateSnapshotMetrics>>) {
  return {
    meses_de_reserva: metrics.kpis.reserveMonths,
    invest_ativos: metrics.kpis.investmentsToAssets,
    divida_ativos: metrics.kpis.debtToAssets,
    tx_poupanca: metrics.kpis.patrimonialSavingsRate,
    pl_total: metrics.kpis.netWorth,
    invest_total: metrics.kpis.investmentsTotal,
    caixa_total: metrics.kpis.cashTotal,
  };
}

export async function rebuildGoalProgress(householdId: string, periodMonth: Date, metricValues: Record<string, number | string>) {
  const goals = await prisma.goal.findMany({
    where: visibleGoalWhere(householdId),
    include: { progressSnapshots: { where: { periodMonth }, take: 1 } },
  });
  for (const goal of goals) {
    const existing = goal.progressSnapshots[0];
    if (goal.comparisonOperator === "manual") {
      const progressPct = existing ? toDecimalNumber(existing.progressPct) : 0;
      const currentValue = existing?.currentValue ?? goal.manualCurrentValue ?? "";
      await prisma.goalProgressSnapshot.upsert({
        where: { goalId_periodMonth: { goalId: goal.id, periodMonth } },
        create: {
          goalId: goal.id,
          periodMonth,
          currentValue: String(currentValue),
          progressPct,
          status: existing?.status ?? (progressPct >= 1 ? "achieved" : "in_progress"),
        },
        update: {
          currentValue: String(currentValue),
          progressPct,
          status: existing?.status ?? (progressPct >= 1 ? "achieved" : "in_progress"),
        },
      });
      continue;
    }

    const currentValue = metricValues[goal.metricKey] ?? goal.manualCurrentValue ?? "0";
    const progress = calculateGoalProgress({
      currentValue,
      targetValue: goal.targetValueDecimal?.toString() ?? goal.targetValueText ?? "0",
      comparisonOperator: goal.comparisonOperator,
      riskCapValue: goal.riskCapValue?.toString() ?? null,
    });
    await prisma.goalProgressSnapshot.upsert({
      where: { goalId_periodMonth: { goalId: goal.id, periodMonth } },
      create: {
        goalId: goal.id,
        periodMonth,
        currentValue: String(currentValue),
        progressPct: progress.toNumber(),
        status: progress.gte(1) ? "achieved" : progress.lt(0.5) ? "attention" : "in_progress",
      },
      update: {
        currentValue: String(currentValue),
        progressPct: progress.toNumber(),
        status: progress.gte(1) ? "achieved" : progress.lt(0.5) ? "attention" : "in_progress",
      },
    });
  }
}

export function emptyCharts() {
  return {
    netWorthEvolution: [],
    assetComposition: [],
    monthlyVariation: [],
    assetsVsDebt: [],
    debtToAssets: [],
    reserveMonths: [],
  };
}

function mapBudgetItemsForCalculation(items: BudgetItem[]) {
  return items.map((item) => ({
    personId: item.personId,
    name: item.name,
    kind: item.kind,
    amountMonthly: toDecimalNumber(item.amountMonthly),
    recurrence: item.recurrence,
    startMonth: item.startMonth,
    endMonth: item.endMonth,
    isActive: item.isActive,
  }));
}

function requiredGoalCagr(
  currentValue: string | number | null,
  targetValue: string | number | null,
  targetDate: string | null,
  periodMonth: Date,
  comparisonOperator: string,
) {
  if (comparisonOperator !== "greater_or_equal") return null;
  const current = parseNumericGoalValue(currentValue);
  const target = parseNumericGoalValue(targetValue);
  if (!targetDate || current === null || target === null || current <= 0 || target <= 0 || current >= target) return null;

  try {
    const targetMonth = parseMonthOrNull(targetDate);
    if (!targetMonth) return null;
    const monthsRemaining = monthDiff(periodMonth, targetMonth);
    if (monthsRemaining <= 0) return null;
    return toNumber(calculateRequiredCagr(current, target, monthsRemaining / 12));
  } catch {
    return null;
  }
}

function parseNumericGoalValue(value: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const compact = value.trim().replace(/[^0-9,.-]/g, "");
  const normalized =
    compact.includes(",") && compact.includes(".")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function calculateBudgetProjectionForPeriod(householdId: string, budgetItems: BudgetItem[], periodMonth: string | Date) {
  const monthStart = asMonthStart(periodMonth);
  const cardWindowStart = asMonthStart(addMonths(monthStart, -11));
  const cardCashflows = await prisma.debtCashflow.findMany({
    where: {
      householdId,
      paymentMonth: {
        gte: cardWindowStart,
        lte: monthStart,
      },
    },
    select: { paymentMonth: true, amount: true },
  });

  return calculateBudgetProjection({
    items: mapBudgetItemsForCalculation(budgetItems),
    periodMonth: monthStart,
    cardExpenses: cardCashflows.map((flow) => ({
      periodMonth: flow.paymentMonth,
      amount: toDecimalNumber(flow.amount),
    })),
  });
}

export function serializeDecimalObject<T extends Record<string, Prisma.Decimal | number | string | null>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === "object" && value !== null && "toString" in value ? value.toString() : value]),
  );
}
