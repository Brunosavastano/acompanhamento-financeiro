import { accountSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertPersonInHousehold } from "@/server/guards";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = accountSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const current = await prisma.account.findFirstOrThrow({
      where: { id, person: { householdId } },
      select: { id: true, personId: true, name: true, accountType: true, isActive: true },
    });
    const updated = await prisma.account.update({
      where: { id },
      data: {
        personId: input.personId,
        name: input.name,
        accountType: input.accountType,
        isActive: input.isActive,
      },
      select: { id: true, personId: true, name: true, accountType: true, isActive: true },
    });
    await audit({ userId, entityType: "account", entityId: id, action: "update", oldValue: current, newValue: updated });
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
    const current = await prisma.account.findFirstOrThrow({
      where: { id, person: { householdId } },
      select: { id: true, personId: true, name: true, accountType: true, isActive: true },
    });
    const positions = await prisma.position.count({ where: { accountId: id } });
    if (positions > 0) {
      return json({ error: "Conta possui balancetes vinculados. Desative a conta em vez de remover." }, { status: 409 });
    }
    await prisma.account.delete({ where: { id } });
    await audit({ userId, entityType: "account", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
