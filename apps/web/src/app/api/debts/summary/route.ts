import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { calculateSnapshotMetrics } from "@/server/metrics";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period_month");
    const snapshot = await prisma.monthlySnapshot.findFirst({
      where: { householdId, ...(period ? { periodMonth: asMonthStart(period) } : {}) },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
    });
    if (!snapshot) return json({ nominalTotal: 0, presentValueTotal: 0, floatGain: 0, monthlyInvoiceTotal: 0, byPerson: {} });
    const metrics = await calculateSnapshotMetrics(householdId, snapshot.id);
    return json(metrics.debt);
  } catch (error) {
    return errorResponse(error);
  }
}
