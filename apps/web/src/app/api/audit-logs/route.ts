import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { getHouseholdAuditLogs } from "@/server/audit-scope";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const requestedTake = Number(searchParams.get("take") ?? 100);
    const take = Number.isFinite(requestedTake) && requestedTake > 0 ? Math.min(requestedTake, 500) : 100;
    const logs = await getHouseholdAuditLogs(householdId, take);
    return json(logs);
  } catch (error) {
    return errorResponse(error);
  }
}
