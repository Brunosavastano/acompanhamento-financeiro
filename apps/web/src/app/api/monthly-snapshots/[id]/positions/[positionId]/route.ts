import { updatePositionSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertAccountInHousehold, assertPersonInHousehold } from "@/server/guards";
import { positionSourceForWrite } from "@/server/position-source";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; positionId: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id, positionId } = await params;
    const input = updatePositionSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    await assertAccountInHousehold(input.accountId, householdId, input.personId);
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (snapshot.status !== "draft") return json({ error: "Só é possível editar posições em rascunho." }, { status: 409 });
    const current = await prisma.position.findFirst({ where: { id: positionId, snapshotId: id } });
    if (!current) return json({ error: "Posição não encontrada neste snapshot." }, { status: 404 });
    // Proveniência informada pelo cliente: "ai_extracted" só quando a pessoa
    // salvou o valor lido do print sem alterá-lo; qualquer outro caso é manual.
    const updated = await prisma.position.update({
      where: { id: positionId },
      data: { ...input, source: await positionSourceForWrite(input.source) },
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
    if (snapshot.status !== "draft") return json({ error: "Só é possível editar posições em rascunho." }, { status: 409 });
    const current = await prisma.position.findFirst({ where: { id: positionId, snapshotId: id } });
    if (!current) return json({ error: "Posição não encontrada neste snapshot." }, { status: 404 });
    await prisma.position.delete({ where: { id: positionId } });
    await audit({ userId, entityType: "position", entityId: positionId, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
