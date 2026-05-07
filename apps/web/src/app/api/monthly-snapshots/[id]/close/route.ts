import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { upsertManualSelicRate } from "@/server/interest-rates";
import { calculateSnapshotMetrics, rebuildGoalProgress } from "@/server/metrics";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const current = await prisma.monthlySnapshot.findFirstOrThrow({ where: { id, householdId } });
    if (current.status !== "draft") {
      return json({ error: "Somente rascunhos podem ser fechados. Crie uma revisão para alterar um fechamento." }, { status: 409 });
    }
    const metrics = await calculateSnapshotMetrics(householdId, id);
    const { updated, interestRateChange } = await prisma.$transaction(async (tx) => {
      const updated = await tx.monthlySnapshot.update({
        where: { id },
        data: { status: "closed", closedAt: new Date() },
      });
      const interestRateChange = await upsertManualSelicRate(tx, {
        householdId,
        periodMonth: current.periodMonth,
        annualRate: current.selicAnnual,
      });
      return { updated, interestRateChange };
    });
    await rebuildGoalProgress(householdId, updated.periodMonth, {
      meses_de_reserva: metrics.kpis.reserveMonths,
      invest_ativos: metrics.kpis.investmentsToAssets,
      divida_ativos: metrics.kpis.debtToAssets,
      tx_poupanca: metrics.kpis.patrimonialSavingsRate,
      pl_total: metrics.kpis.netWorth,
      invest_total: metrics.kpis.investmentsTotal,
      caixa_total: metrics.kpis.cashTotal,
    });
    await audit({ userId, entityType: "monthly_snapshot", entityId: id, action: "close", oldValue: current, newValue: updated });
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
    return json({ snapshot: updated, metrics });
  } catch (error) {
    return errorResponse(error);
  }
}
