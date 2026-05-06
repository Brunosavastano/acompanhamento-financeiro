import { importExcelSchema } from "@finance/shared-types";
import { getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { runExcelImport, saveUploadToTemp } from "@/server/import-excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const contentType = request.headers.get("content-type") ?? "";

    let filePath: string | undefined;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "Envie um arquivo .xlsx no campo file." }, { status: 400 });
      filePath = await saveUploadToTemp(file);
    } else {
      const body = importExcelSchema.parse(await request.json().catch(() => ({})));
      filePath = body.filePath ?? process.env.DEFAULT_EXCEL_PATH;
    }

    if (!filePath) return json({ error: "Informe filePath ou configure DEFAULT_EXCEL_PATH." }, { status: 400 });
    const job = await runExcelImport({ householdId, filePath });
    return json(job, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
