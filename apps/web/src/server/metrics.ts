import type { BudgetItem, Prisma, SnapshotStatus } from "@prisma/client";
import {
  addMonths,
  calculateBudgetProjection,
  calculateDebtMetrics,
  calculateMonthlyInvoiceMetrics,
  calculatePatrimonyMetrics,
  calculateRequiredCagr,
  dedupeLatestInvoiceBase,
  monthDiff,
  realizedInvoiceExpenses,
  toMoneyNumber,
  toNumber,
} from "@finance/financial-calculations";
import { prisma } from "@/lib/prisma";
import { asMonthStart, formatPeriod, parseMonthOrNull } from "@/lib/date";
import { toDecimalNumber } from "@/lib/format";
import {
  goalTargetValue,
  isComputedGoal,
  metricValuesForGoals,
  pickClosestGoals,
  resolveGoalProgress,
  type GoalMetricValues,
} from "@/server/goal-progress";
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
  const goalRows = await getGoalRowsForMetrics(householdId, snapshot.periodMonth, metricValuesForGoals(metrics.kpis));
  const goals = pickClosestGoals(goalRows);
  const reserveGoal = goalRows.find((goal) => goal.metricKey === "meses_de_reserva");

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
        { name: "Dívidas PV", value: metrics.kpis.debtPvTotal },
      ],
      monthlyVariation: history.map((row) => ({ month: row.month, value: row.monthlyVariation, months: row.monthsSincePrevious })),
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
    composition: buildCompositionScopes(metrics.snapshot.positions, people, metrics.debt),
    reserveTargetMonths: reserveGoal ? reserveGoal.targetNumeric : null,
  };
}

type CompositionBucket = { investments: number; cash: number; benefits: number };

export type CompositionScope = CompositionBucket & {
  id: string;
  label: string;
  total: number;
  debtPvTotal: number;
};

function buildCompositionScopes(
  positions: { personId: string; category: string; amount: Prisma.Decimal }[],
  people: { id: string; name: string }[],
  debt: { presentValueTotal: number; byPerson: Record<string, { presentValueTotal: number }> },
): CompositionScope[] {
  const emptyBucket = (): CompositionBucket => ({ investments: 0, cash: 0, benefits: 0 });
  const household = emptyBucket();
  const perPerson = new Map(people.map((person) => [person.id, emptyBucket()]));

  for (const position of positions) {
    const amount = toDecimalNumber(position.amount);
    // Mesmas fronteiras dos KPIs (e da planilha): cashback conta como
    // investimento e VR/VA como caixa — assim "Investimentos" e "Caixa" batem
    // entre o card do topo e este painel.
    const key =
      position.category === "investment" || position.category === "cashback"
        ? "investments"
        : position.category === "cash"
          ? "cash"
          : "benefits";
    household[key] += amount;
    const personBucket = perPerson.get(position.personId);
    if (personBucket) personBucket[key] += amount;
  }

  const toScope = (id: string, label: string, bucket: CompositionBucket, debtPvTotal: number): CompositionScope => ({
    id,
    label,
    ...bucket,
    total: bucket.investments + bucket.cash + bucket.benefits,
    debtPvTotal,
  });

  return [
    toScope("familia", "Família", household, debt.presentValueTotal),
    ...people.map((person) =>
      toScope(person.id, person.name, perPerson.get(person.id) ?? emptyBucket(), debt.byPerson[person.id]?.presentValueTotal ?? 0),
    ),
  ];
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
      select: { personId: true, cardName: true, invoiceMonth: true, paymentMonth: true, amount: true, source: true },
    }),
  ]);

  const budget = calculateBudgetProjection({
    items: mapBudgetItemsForCalculation(budgetItems),
    periodMonth,
    cardExpenses: mapRealizedCardExpenses(cardCashflows),
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
  // "Base mais recente vence": re-declarações da mesma fatura em bases
  // diferentes substituem as projeções antigas em vez de somar com elas.
  const monthlyInvoice = calculateMonthlyInvoiceMetrics(
    dedupeLatestInvoiceBase(
      monthlyInvoiceCashflows.map((flow) => ({
        personId: flow.personId,
        cardName: flow.cardName,
        invoiceMonth: flow.invoiceMonth,
        paymentMonth: flow.paymentMonth,
        amount: toDecimalNumber(flow.amount),
        source: flow.source,
      })),
    ),
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
  // Mês pulado (ex.: setembro → novembro): a variação cobre 2 meses.
  const monthsSincePrevious = previousSnapshot ? Math.max(1, monthDiff(previousSnapshot.periodMonth, snapshot.periodMonth)) : 1;

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
    monthsSincePrevious,
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
      monthsSincePrevious,
      previousPeriodMonth: previousSnapshot ? formatPeriod(previousSnapshot.periodMonth) : null,
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

/**
 * Resumo de dívidas de uma base SEM snapshot (mês em aberto): PV/nominal/float
 * da base + fatura do mês ("base mais recente vence"), com a Selic informada.
 * Espelha o bloco `debt` de calculateSnapshotMetrics.
 */
export async function calculateDebtSummaryForPeriod(householdId: string, periodMonth: Date, selicAnnual: number) {
  const [debtCashflows, monthlyInvoiceCashflows] = await Promise.all([
    prisma.debtCashflow.findMany({ where: { householdId, invoiceMonth: periodMonth } }),
    prisma.debtCashflow.findMany({ where: { householdId, paymentMonth: periodMonth } }),
  ]);
  const mapFlow = (flow: (typeof debtCashflows)[number]) => ({
    personId: flow.personId,
    cardName: flow.cardName,
    invoiceMonth: flow.invoiceMonth,
    paymentMonth: flow.paymentMonth,
    amount: toDecimalNumber(flow.amount),
    source: flow.source,
  });
  const debt = calculateDebtMetrics(debtCashflows.map(mapFlow), selicAnnual, periodMonth);
  const monthlyInvoice = calculateMonthlyInvoiceMetrics(dedupeLatestInvoiceBase(monthlyInvoiceCashflows.map(mapFlow)), periodMonth);
  const personIds = new Set([...Object.keys(debt.byPerson), ...Object.keys(monthlyInvoice.byPerson)]);

  return {
    nominalTotal: toMoneyNumber(debt.nominalTotal),
    presentValueTotal: toMoneyNumber(debt.presentValueTotal),
    floatGain: toMoneyNumber(debt.floatGain),
    monthlyInvoiceTotal: toMoneyNumber(monthlyInvoice.monthlyInvoiceTotal),
    byPerson: Object.fromEntries(
      [...personIds].map((personId) => {
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
  let previousPeriod: Date | null = null;
  const budgetItems = await prisma.budgetItem.findMany({ where: { householdId } });

  for (const snapshot of deduped.values()) {
    const monthsSincePrevious = previousPeriod ? Math.max(1, monthDiff(previousPeriod, snapshot.periodMonth)) : 1;
    previousPeriod = snapshot.periodMonth;
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
      monthsSincePrevious,
    });

    const netWorth = toMoneyNumber(patrimony.netWorth);
    // PL anterior SEM arredondar (como calculateSnapshotMetrics e a planilha):
    // arredondar antes de subtrair deixava a variação 1 centavo diferente.
    previousNetWorth = toNumber(patrimony.netWorth);
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
      monthsSincePrevious,
      debtToAssets: toNumber(patrimony.debtToAssets),
      reserveMonths: toNumber(patrimony.reserveMonths),
      patrimonialSavingsRate: toNumber(patrimony.patrimonialSavingsRate),
    });
  }

  return rows;
}

export async function getGoalRows(householdId: string, periodMonth: Date | string) {
  // Só meses FECHADOS alimentam as metas: um rascunho recém-criado tem os
  // saldos em R$ 0 e faria a "Dívida/Ativos" parecer atingida, a reserva zerar etc.
  const snapshot = await prisma.monthlySnapshot.findFirst({
    where: { householdId, periodMonth: asMonthStart(periodMonth), status: { in: dashboardSnapshotStatuses } },
    orderBy: { revisionNumber: "desc" },
  });
  const metricValues = snapshot ? metricValuesForGoals((await calculateSnapshotMetrics(householdId, snapshot.id)).kpis) : {};
  return getGoalRowsForMetrics(householdId, asMonthStart(periodMonth), metricValues);
}

/** Metas visíveis com o registro de progresso mais recente ATÉ o mês (base para metas manuais). */
function findGoalsWithLatestProgress(householdId: string, periodMonth: Date) {
  return prisma.goal.findMany({
    where: visibleGoalWhere(householdId),
    include: {
      progressSnapshots: {
        where: { periodMonth: { lte: periodMonth } },
        orderBy: { periodMonth: "desc" },
        take: 1,
      },
    },
    orderBy: [{ horizon: "asc" }, { createdAt: "asc" }],
  });
}

async function getGoalRowsForMetrics(householdId: string, periodMonth: Date, metricValues: GoalMetricValues) {
  const goals = await findGoalsWithLatestProgress(householdId, periodMonth);

  return goals.map((goal) => {
    const targetValue = goalTargetValue(goal);
    const resolved = resolveGoalProgress(goal, metricValues, goal.progressSnapshots[0] ?? null);
    return {
      id: goal.id,
      title: goal.title,
      horizon: goal.horizon,
      metricKey: goal.metricKey,
      targetValue,
      targetDate: goal.targetDate,
      comparisonOperator: goal.comparisonOperator,
      riskCapValue: goal.riskCapValue?.toString() ?? null,
      notes: goal.notes,
      progressPct: resolved.progressPct,
      currentValue: resolved.currentValue,
      currentNumeric: resolved.currentNumeric,
      targetNumeric: resolved.targetNumeric,
      status: resolved.status,
      progressSource: resolved.progressSource,
      isComputed: isComputedGoal(goal),
      requiredCagr: requiredGoalCagr(resolved.currentNumeric, resolved.targetNumeric, goal.targetDate, periodMonth, goal.comparisonOperator),
    };
  });
}

/**
 * Grava o progresso das metas com métrica do app no mês fechado (histórico).
 * Metas manuais NÃO ganham cópia: a leitura já carrega o último registro
 * informado, e uma cópia automática impediria que a correção de um mês
 * passado chegasse aos meses seguintes.
 */
export async function rebuildGoalProgress(householdId: string, periodMonth: Date, metricValues: GoalMetricValues) {
  const goals = await findGoalsWithLatestProgress(householdId, periodMonth);
  for (const goal of goals) {
    if (!isComputedGoal(goal)) continue;
    const resolved = resolveGoalProgress(goal, metricValues, goal.progressSnapshots[0] ?? null);
    const data = {
      currentValue: resolved.currentValue ?? "",
      progressPct: resolved.progressPct,
      status: resolved.status,
    };
    await prisma.goalProgressSnapshot.upsert({
      where: { goalId_periodMonth: { goalId: goal.id, periodMonth } },
      create: { goalId: goal.id, periodMonth, ...data },
      update: data,
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
  current: number | null,
  target: number | null,
  targetDate: string | null,
  periodMonth: Date,
  comparisonOperator: string,
) {
  if (comparisonOperator !== "greater_or_equal") return null;
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
    select: { personId: true, cardName: true, invoiceMonth: true, paymentMonth: true, amount: true, source: true },
  });

  return calculateBudgetProjection({
    items: mapBudgetItemsForCalculation(budgetItems),
    periodMonth: monthStart,
    cardExpenses: mapRealizedCardExpenses(cardCashflows),
  });
}

/**
 * Gasto mensal do cartão para a média móvel do orçamento: só a fatura
 * REALIZADA de cada mês (declarada na própria base), como na planilha.
 */
export function mapRealizedCardExpenses(
  cardCashflows: {
    personId: string;
    cardName: string;
    invoiceMonth: Date;
    paymentMonth: Date;
    amount: Prisma.Decimal | number;
  }[],
) {
  return realizedInvoiceExpenses(
    cardCashflows.map((flow) => ({
      personId: flow.personId,
      cardName: flow.cardName,
      invoiceMonth: flow.invoiceMonth,
      paymentMonth: flow.paymentMonth,
      amount: toDecimalNumber(flow.amount),
    })),
  );
}

export function serializeDecimalObject<T extends Record<string, Prisma.Decimal | number | string | null>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === "object" && value !== null && "toString" in value ? value.toString() : value]),
  );
}
