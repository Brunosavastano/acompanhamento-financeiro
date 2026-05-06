import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { calculateSnapshotMetrics } from "@/server/metrics";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { id } = await params;
    return json(await calculateSnapshotMetrics(householdId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
