import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { getDefaultSelicAnnual } from "@/server/interest-rates";
import { calculateDebtSummaryForPeriod, calculateSnapshotMetrics } from "@/server/metrics";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period_month");
    const snapshot = await prisma.monthlySnapshot.findFirst({
      where: { householdId, ...(period ? { periodMonth: asMonthStart(period) } : {}) },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
    });
    if (snapshot) {
      const metrics = await calculateSnapshotMetrics(householdId, snapshot.id);
      return json(metrics.debt);
    }
    if (period) {
      // Mês em aberto, sem snapshot ainda: resume ao vivo com a última Selic salva.
      const selic = Number(await getDefaultSelicAnnual(householdId));
      return json(await calculateDebtSummaryForPeriod(householdId, asMonthStart(period), selic));
    }
    return json({ nominalTotal: 0, presentValueTotal: 0, floatGain: 0, monthlyInvoiceTotal: 0, byPerson: {} });
  } catch (error) {
    return errorResponse(error);
  }
}
