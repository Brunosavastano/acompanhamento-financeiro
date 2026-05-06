import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { id } = await params;
    await prisma.importJob.findFirstOrThrow({ where: { id, householdId } });
    const rows = await prisma.importReconciliationRow.findMany({
      where: { importJobId: id },
      orderBy: [{ periodMonth: "asc" }, { metricKey: "asc" }],
    });
    return json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}
