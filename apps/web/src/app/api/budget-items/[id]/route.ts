import { budgetItemSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertPersonInHousehold } from "@/server/guards";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = budgetItemSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const current = await prisma.budgetItem.findFirstOrThrow({ where: { id, householdId } });
    const updated = await prisma.budgetItem.update({
      where: { id },
      data: {
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
    await audit({ userId, entityType: "budget_item", entityId: id, action: "update", oldValue: current, newValue: updated });
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
    const current = await prisma.budgetItem.findFirstOrThrow({ where: { id, householdId } });
    await prisma.budgetItem.delete({ where: { id } });
    await audit({ userId, entityType: "budget_item", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
