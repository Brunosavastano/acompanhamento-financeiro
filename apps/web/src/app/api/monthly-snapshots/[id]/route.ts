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
    if (current.status !== "draft") return json({ error: "Snapshots fechados so podem ser alterados via revisao." }, { status: 409 });
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
    if (current.status !== "draft") return json({ error: "Somente rascunhos podem ser excluidos." }, { status: 409 });

    await prisma.monthlySnapshot.delete({ where: { id } });
    await audit({ userId, entityType: "monthly_snapshot", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
