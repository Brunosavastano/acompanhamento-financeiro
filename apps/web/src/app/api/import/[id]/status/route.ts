import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { id } = await params;
    const job = await prisma.importJob.findFirstOrThrow({
      where: { id, householdId },
      include: { _count: { select: { reconciliationRows: true } } },
    });
    return json(job);
  } catch (error) {
    return errorResponse(error);
  }
}
