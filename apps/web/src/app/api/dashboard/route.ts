import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { getDashboardData } from "@/server/metrics";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    return json(await getDashboardData(householdId, searchParams.get("period_month") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
