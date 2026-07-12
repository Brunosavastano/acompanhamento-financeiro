import { CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { ReportsManager } from "@/components/reports-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getHouseholdAuditLogs } from "@/server/audit-scope";

export default async function RelatoriosPage() {
  const householdId = await getRequiredPageHouseholdId();
  const jobs = await prisma.importJob.findMany({
    where: { householdId },
    include: { _count: { select: { reconciliationRows: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const latestJob = jobs[0] ?? null;
  const latestRows = latestJob
    ? await prisma.importReconciliationRow.findMany({
        where: { importJobId: latestJob.id },
        orderBy: [{ periodMonth: "asc" }, { metricKey: "asc" }],
      })
    : [];
  const auditLogs = await getHouseholdAuditLogs(householdId, 100);
  const failedCount = latestRows.filter((row) => !row.passed).length;

  return (
    <>
      <PageHeader
        title="Dados e relatórios"
        actions={
          latestRows.length > 0 ? (
            failedCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-positive-text">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Dados conferem com a planilha original
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-negative-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                {failedCount} {failedCount === 1 ? "divergência" : "divergências"} na reconciliação
              </span>
            )
          ) : undefined
        }
      />
      <PageBody>
        <ReportsManager
          defaultPath={process.env.DEFAULT_EXCEL_PATH ?? ""}
          initialAuditLogs={auditLogs.map((log) => ({
            id: log.id,
            entityType: log.entityType,
            entityId: log.entityId,
            action: log.action,
            reason: log.reason,
            createdAt: log.createdAt.toISOString(),
            user: log.user,
          }))}
          initialJobs={jobs.map((job) => ({
            id: job.id,
            fileName: job.fileName,
            status: job.status,
            createdAt: job.createdAt.toISOString(),
            rows: job._count.reconciliationRows,
            errorMessage: job.errorMessage,
          }))}
          initialSelectedJobId={latestJob?.id ?? null}
          initialRows={latestRows.map((row) => ({
            id: row.id,
            periodMonth: row.periodMonth.toISOString(),
            metricKey: row.metricKey,
            spreadsheetValue: String(row.spreadsheetValue),
            appValue: String(row.appValue),
            delta: String(row.delta),
            passed: row.passed,
          }))}
        />
      </PageBody>
    </>
  );
}
