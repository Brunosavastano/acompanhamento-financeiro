import { prisma } from "@/lib/prisma";
import { runExcelImport } from "@/server/import-excel";

const filePath =
  process.argv[2] ??
  process.env.DEFAULT_EXCEL_PATH ??
  "G:/Meu Drive/Seagate/Pessoal/Documentos/Financeiro/Plan_Fin_melhorada_claudeV2.xlsx";

async function main() {
  const household =
    (await prisma.household.findUnique({ where: { id: "family-savastano" } })) ??
    (await prisma.household.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!household) {
    throw new Error("Nenhum household encontrado. Rode npm run prisma:seed antes de importar.");
  }

  const job = await runExcelImport({ householdId: household.id, filePath });
  const failures = job.reconciliationRows.filter((row) => !row.passed);

  console.log(`Importacao ${job.status}: ${job.id}`);
  console.log(`Arquivo: ${job.fileName}`);
  console.log(`Reconciliacoes: ${job.reconciliationRows.length}`);
  console.log(`Falhas: ${failures.length}`);

  if (failures.length) {
    console.table(
      failures.slice(0, 20).map((row) => ({
        mes: row.periodMonth.toISOString().slice(0, 7),
        metrica: row.metricKey,
        planilha: row.spreadsheetValue?.toString(),
        app: row.appValue?.toString(),
        delta: row.delta?.toString(),
      })),
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
