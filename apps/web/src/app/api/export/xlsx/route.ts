import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse } from "@/lib/api";
import { buildExportSheets, exportFileName } from "@/lib/export-workbook";
import { getExportWorkbookData, writeExportWorkbook } from "@/server/export-workbook";

/** Planilha .xlsx só para leitura com os números atuais da família (não é o formato da importação). */
export async function GET() {
  try {
    const householdId = await getRequiredHouseholdId();
    const data = await getExportWorkbookData(householdId);
    const body = writeExportWorkbook(buildExportSheets(data));
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${exportFileName(data.referenceMonth)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
