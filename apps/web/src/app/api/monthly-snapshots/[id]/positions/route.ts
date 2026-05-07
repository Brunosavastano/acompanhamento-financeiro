import { updatePositionSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertAccountInHousehold, assertPersonInHousehold } from "@/server/guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = updatePositionSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    await assertAccountInHousehold(input.accountId, householdId, input.personId);
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (snapshot.status !== "draft") return json({ error: "Só é possível editar posições em rascunho." }, { status: 409 });
    const position = await prisma.position.create({
      data: {
        snapshotId: id,
        personId: input.personId,
        accountId: input.accountId,
        category: input.category,
        amount: input.amount,
        source: "manual",
      },
      include: { person: true, account: true },
    });
    await audit({ userId, entityType: "position", entityId: position.id, action: "create", newValue: position });
    return json(position, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
