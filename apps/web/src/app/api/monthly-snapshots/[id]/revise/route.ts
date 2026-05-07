import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const current = await prisma.monthlySnapshot.findFirstOrThrow({
      where: { id, householdId },
      include: { positions: true },
    });
    if (current.status !== "closed") {
      return json({ error: "Somente snapshots fechados podem gerar revisão." }, { status: 409 });
    }
    const latest = await prisma.monthlySnapshot.findFirst({
      where: { householdId, periodMonth: current.periodMonth },
      orderBy: { revisionNumber: "desc" },
    });
    const revisionNumber = (latest?.revisionNumber ?? current.revisionNumber) + 1;

    const revision = await prisma.$transaction(async (tx) => {
      await tx.monthlySnapshot.update({ where: { id: current.id }, data: { status: "revised" } });
      const created = await tx.monthlySnapshot.create({
        data: {
          householdId,
          periodMonth: current.periodMonth,
          status: "draft",
          selicAnnual: current.selicAnnual,
          revisionNumber,
          revisedFromId: current.id,
          notes: body.notes ?? current.notes,
        },
      });
      await tx.position.createMany({
        data: current.positions.map((position) => ({
          snapshotId: created.id,
          personId: position.personId,
          accountId: position.accountId,
          category: position.category,
          amount: position.amount,
          source: "adjustment" as const,
        })),
      });
      return created;
    });
    await audit({ userId, entityType: "monthly_snapshot", entityId: id, action: "revise", newValue: revision });
    return json(revision, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
