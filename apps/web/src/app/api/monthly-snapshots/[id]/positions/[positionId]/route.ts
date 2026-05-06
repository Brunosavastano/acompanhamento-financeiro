import { updatePositionSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertAccountInHousehold, assertPersonInHousehold } from "@/server/guards";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; positionId: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id, positionId } = await params;
    const input = updatePositionSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    await assertAccountInHousehold(input.accountId, householdId, input.personId);
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (snapshot.status !== "draft") return json({ error: "So e possivel editar posicoes em rascunho." }, { status: 409 });
    const current = await prisma.position.findFirst({ where: { id: positionId, snapshotId: id } });
    if (!current) return json({ error: "Posicao nao encontrada neste snapshot." }, { status: 404 });
    const updated = await prisma.position.update({
      where: { id: positionId },
      data: { ...input, source: "manual" },
    });
    await audit({ userId, entityType: "position", entityId: positionId, action: "update", oldValue: current, newValue: updated });
    return json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; positionId: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id, positionId } = await params;
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (snapshot.status !== "draft") return json({ error: "So e possivel editar posicoes em rascunho." }, { status: 409 });
    const current = await prisma.position.findFirst({ where: { id: positionId, snapshotId: id } });
    if (!current) return json({ error: "Posicao nao encontrada neste snapshot." }, { status: 404 });
    await prisma.position.delete({ where: { id: positionId } });
    await audit({ userId, entityType: "position", entityId: positionId, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
