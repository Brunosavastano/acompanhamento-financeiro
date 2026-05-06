import { createSnapshotSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { upsertManualSelicRate } from "@/server/interest-rates";

export async function GET() {
  try {
    const householdId = await getRequiredHouseholdId();
    const snapshots = await prisma.monthlySnapshot.findMany({
      where: { householdId },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
      include: { positions: { include: { account: true, person: true } } },
    });
    return json(snapshots);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = createSnapshotSchema.parse(await request.json());
    const periodMonth = asMonthStart(input.periodMonth);

    const existing = await prisma.monthlySnapshot.findFirst({
      where: { householdId, periodMonth },
      orderBy: { revisionNumber: "desc" },
    });
    if (existing) {
      return json(
        {
          error:
            existing.status === "draft"
              ? "Ja existe um rascunho para este mes. Selecione-o em fechamentos existentes."
              : "Este mes ja foi fechado. Crie uma revisao a partir do fechamento existente.",
        },
        { status: 409 },
      );
    }

    const accounts = await prisma.account.findMany({
      where: { person: { householdId }, isActive: true },
      include: { person: true },
    });

    const { hydratedSnapshot, interestRateChange } = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.monthlySnapshot.create({
        data: {
          householdId,
          periodMonth,
          selicAnnual: input.selicAnnual,
          status: "draft",
          notes: input.notes,
        },
      });

      await tx.position.createMany({
        data: accounts.map((account) => ({
          snapshotId: snapshot.id,
          personId: account.personId,
          accountId: account.id,
          category: account.accountType === "other" ? "cash" : account.accountType,
          amount: 0,
          source: "manual" as const,
        })),
      });

      const interestRateChange = await upsertManualSelicRate(tx, {
        householdId,
        periodMonth,
        annualRate: input.selicAnnual,
      });

      const hydratedSnapshot = await tx.monthlySnapshot.findFirstOrThrow({
        where: { id: snapshot.id, householdId },
        include: { positions: { include: { account: true, person: true }, orderBy: { createdAt: "asc" } } },
      });

      return { hydratedSnapshot, interestRateChange };
    });

    await audit({ userId, entityType: "monthly_snapshot", entityId: hydratedSnapshot.id, action: "create", newValue: hydratedSnapshot });
    if (interestRateChange.changed) {
      await audit({
        userId,
        entityType: "interest_rate",
        entityId: interestRateChange.rate.id,
        action: interestRateChange.previous ? "update" : "create",
        oldValue: interestRateChange.previous,
        newValue: interestRateChange.rate,
      });
    }
    return json(hydratedSnapshot, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
