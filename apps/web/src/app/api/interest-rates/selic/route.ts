import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { resolveSelicAnnualForPeriod } from "@/server/interest-rates";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const periodMonth = asMonthStart(searchParams.get("period_month") ?? new Date());
    const selic = await resolveSelicAnnualForPeriod(householdId, periodMonth);
    return json(selic);
  } catch (error) {
    return errorResponse(error);
  }
}
