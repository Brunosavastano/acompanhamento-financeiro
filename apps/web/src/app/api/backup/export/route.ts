import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse } from "@/lib/api";
import { backupDatasetRows, getBackupData, isCsvDatasetKey, toCsv } from "@/server/backup";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    const dataset = url.searchParams.get("dataset");
    const data = await getBackupData(householdId);

    if (format === "csv") {
      if (!isCsvDatasetKey(dataset)) {
        return Response.json({ error: "Dataset CSV invalido." }, { status: 400 });
      }
      const body = toCsv(backupDatasetRows(data, dataset));
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="backup-financeiro-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const body = JSON.stringify(data, null, 2);

    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="backup-financeiro-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
