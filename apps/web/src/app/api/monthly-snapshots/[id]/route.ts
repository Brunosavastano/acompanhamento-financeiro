import { z } from "zod";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { resolveSelicAnnualForPeriod, upsertSelicRate } from "@/server/interest-rates";

const patchSchema = z.object({
  selicAnnual: z.coerce.number().min(0).max(1).optional(),
  refreshSelic: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { id } = await params;
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({
      where: { id, householdId },
      include: { positions: { include: { person: true, account: true }, orderBy: { createdAt: "asc" } } },
    });
    return json(snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = patchSchema.parse(await request.json());
    const current = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (current.status !== "draft") return json({ error: "Snapshots fechados só podem ser alterados via revisão." }, { status: 409 });
    const selic =
      input.selicAnnual !== undefined || input.refreshSelic
        ? await resolveSelicAnnualForPeriod(householdId, current.periodMonth, input.selicAnnual)
        : null;

    const { updated, interestRateChange } = await prisma.$transaction(async (tx) => {
      const updated = await tx.monthlySnapshot.update({
        where: { id },
        data: {
          notes: input.notes,
          ...(selic ? { selicAnnual: selic.annualRate } : {}),
        },
      });
      const interestRateChange =
        !selic
          ? null
          : await upsertSelicRate(tx, {
              householdId,
              periodMonth: current.periodMonth,
              annualRate: selic.annualRate,
              source: selic.source,
            });

      return { updated, interestRateChange };
    });
    await audit({ userId, entityType: "monthly_snapshot", entityId: id, action: "update", oldValue: current, newValue: updated });
    if (interestRateChange?.changed) {
      await audit({
        userId,
        entityType: "interest_rate",
        entityId: interestRateChange.rate.id,
        action: interestRateChange.previous ? "update" : "create",
        oldValue: interestRateChange.previous,
        newValue: interestRateChange.rate,
      });
    }
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
    const current = await prisma.monthlySnapshot.findFirstOrThrow({
      where: { id, householdId },
      include: { positions: true },
    });
    if (current.status !== "draft") return json({ error: "Somente rascunhos podem ser excluídos." }, { status: 409 });

    // Excluir uma revisão em rascunho devolve o fechamento de origem a
    // "fechado" — senão o mês ficava "revisado" sem revisão e sem como revisar de novo.
    const restored = await prisma.$transaction(async (tx) => {
      await tx.monthlySnapshot.delete({ where: { id } });
      if (!current.revisedFromId) return null;
      const source = await tx.monthlySnapshot.findFirst({ where: { id: current.revisedFromId, householdId, status: "revised" } });
      if (!source) return null;
      const reopened = await tx.monthlySnapshot.update({ where: { id: source.id }, data: { status: "closed" } });
      await audit(
        {
          userId,
          entityType: "monthly_snapshot",
          entityId: source.id,
          action: "update",
          oldValue: source,
          newValue: reopened,
          reason: "Revisão em rascunho excluída: fechamento de origem volta a valer.",
        },
        tx,
      );
      return reopened;
    });
    await audit({ userId, entityType: "monthly_snapshot", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true, restoredSnapshotId: restored?.id ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
