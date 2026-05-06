import { goalSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { getGoalRows } from "@/server/metrics";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const requestedPeriod = searchParams.get("period_month");
    const latestSnapshot = await prisma.monthlySnapshot.findFirst({
      where: { householdId },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
    });
    const periodMonth = requestedPeriod ? asMonthStart(requestedPeriod) : latestSnapshot?.periodMonth ?? new Date();
    const goals = await getGoalRows(householdId, periodMonth);
    return json(goals);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = goalSchema.parse(await request.json());
    const numericTarget = typeof input.targetValue === "number" ? input.targetValue : Number.NaN;
    const goal = await prisma.goal.create({
      data: {
        householdId,
        title: input.title,
        horizon: input.horizon,
        metricKey: input.metricKey,
        targetValueDecimal: Number.isFinite(numericTarget) ? numericTarget : null,
        targetValueText: Number.isFinite(numericTarget) ? null : input.targetValue === null ? null : String(input.targetValue),
        targetDate: input.targetDate,
        comparisonOperator: input.comparisonOperator,
        riskCapValue: input.riskCapValue,
        manualCurrentValue: input.manualCurrentValue === null || input.manualCurrentValue === undefined ? null : String(input.manualCurrentValue),
        notes: input.notes,
      },
    });
    await audit({ userId, entityType: "goal", entityId: goal.id, action: "create", newValue: goal });
    return json(goal, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
