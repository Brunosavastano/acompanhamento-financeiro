import { budgetItemSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { addMonths, calculateBudgetProjection, toMoneyNumber, toNumber } from "@finance/financial-calculations";
import { toDecimalNumber } from "@/lib/format";
import { assertPersonInHousehold } from "@/server/guards";
import { mapCardExpensesLatestBase } from "@/server/metrics";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period_month") ?? new Date().toISOString().slice(0, 7);
    const periodMonth = asMonthStart(period);
    const cardWindowStart = asMonthStart(addMonths(periodMonth, -11));
    const [items, cardCashflows] = await Promise.all([
      prisma.budgetItem.findMany({
        where: { householdId },
        include: { person: true },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      }),
      prisma.debtCashflow.findMany({
        where: {
          householdId,
          paymentMonth: {
            gte: cardWindowStart,
            lte: periodMonth,
          },
        },
        select: { personId: true, cardName: true, invoiceMonth: true, paymentMonth: true, amount: true, source: true },
      }),
    ]);
    const metrics = calculateBudgetProjection({
      items: items.map((item) => ({
        personId: item.personId,
        name: item.name,
        kind: item.kind,
        amountMonthly: toDecimalNumber(item.amountMonthly),
        recurrence: item.recurrence,
        startMonth: item.startMonth,
        endMonth: item.endMonth,
        isActive: item.isActive,
      })),
      periodMonth: period,
      cardExpenses: mapCardExpensesLatestBase(cardCashflows),
    });
    return json({
      items,
      metrics: {
        incomeTotal: toMoneyNumber(metrics.incomeTotal),
        fixedExpenseTotal: toMoneyNumber(metrics.fixedExpenseTotal),
        variableExpenseTotal: toMoneyNumber(metrics.variableExpenseTotal),
        expenseTotal: toMoneyNumber(metrics.expenseTotal),
        monthlySurplus: toMoneyNumber(metrics.monthlySurplus),
        annualizedSurplus: toMoneyNumber(metrics.annualizedSurplus),
        incomeCommitment: toNumber(metrics.incomeCommitment),
        budgetSavingsRate: toNumber(metrics.budgetSavingsRate),
        budgetItemVariableExpenseTotal: toMoneyNumber(metrics.budgetItemVariableExpenseTotal),
        cardMovingAverageExpense: toMoneyNumber(metrics.cardMovingAverageExpense),
        cardMovingAverageAppliedExpense: toMoneyNumber(metrics.cardMovingAverageAppliedExpense),
        cardMovingAverageApplied: metrics.cardMovingAverageApplied,
        cardMovingAverageMonths: metrics.cardMovingAverageMonths,
        cardMovingAverageWindowStartMonth: metrics.cardMovingAverageWindowStartMonth,
        cardMovingAverageWindowEndMonth: metrics.cardMovingAverageWindowEndMonth,
        cardMonthlyTotals: metrics.cardMonthlyTotals.map((row) => ({
          periodMonth: row.periodMonth,
          amount: toMoneyNumber(row.amount),
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = budgetItemSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const item = await prisma.budgetItem.create({
      data: {
        householdId,
        personId: input.personId,
        name: input.name,
        kind: input.kind,
        amountMonthly: input.amountMonthly,
        recurrence: input.recurrence,
        startMonth: asMonthStart(input.startMonth),
        endMonth: input.endMonth ? asMonthStart(input.endMonth) : null,
        isActive: input.isActive,
      },
    });
    await audit({ userId, entityType: "budget_item", entityId: item.id, action: "create", newValue: item });
    return json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
