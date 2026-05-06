import { goalSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = goalSchema.parse(await request.json());
    const current = await prisma.goal.findFirstOrThrow({ where: { id, householdId } });
    const numericTarget = typeof input.targetValue === "number" ? input.targetValue : Number.NaN;
    const updated = await prisma.goal.update({
      where: { id },
      data: {
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
    await audit({ userId, entityType: "goal", entityId: id, action: "update", oldValue: current, newValue: updated });
    return json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const current = await prisma.goal.findFirstOrThrow({ where: { id, householdId } });
    await prisma.goal.delete({ where: { id } });
    await audit({ userId, entityType: "goal", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
