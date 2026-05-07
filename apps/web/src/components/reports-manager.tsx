"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, History, RefreshCw, Upload } from "lucide-react";
import { Button, Input, Panel } from "@/components/ui";

type Job = {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  rows: number;
  errorMessage: string | null;
};

type ReconciliationRow = {
  id: string;
  periodMonth: string;
  metricKey: string;
  spreadsheetValue: string;
  appValue: string;
  delta: string;
  passed: boolean;
};

type AuditLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

type RowFilter = "all" | "failed" | "passed";

const csvBackups = [
  { key: "household", label: "Família" },
  { key: "persons", label: "Pessoas" },
  { key: "accounts", label: "Contas" },
  { key: "snapshots", label: "Snapshots" },
  { key: "positions", label: "Posições" },
  { key: "debtCashflows", label: "Dívidas" },
  { key: "budgetItems", label: "Orçamento" },
  { key: "goals", label: "Metas" },
  { key: "goalProgressSnapshots", label: "Progresso metas" },
  { key: "interestRates", label: "Taxas" },
  { key: "importJobs", label: "Importações" },
  { key: "importReconciliationRows", label: "Reconciliação" },
  { key: "auditLogs", label: "Auditoria" },
] as const;

export function ReportsManager({
  defaultPath,
  initialAuditLogs,
  initialJobs,
  initialRows,
  initialSelectedJobId,
}: {
  defaultPath: string;
  initialAuditLogs: AuditLog[];
  initialJobs: Job[];
  initialRows: ReconciliationRow[];
  initialSelectedJobId: string | null;
}) {
  const [filePath, setFilePath] = useState(defaultPath);
  const [jobs, setJobs] = useState(initialJobs);
  const [rows, setRows] = useState<ReconciliationRow[]>(initialRows);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialSelectedJobId);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const passedRows = rows.filter((row) => row.passed).length;
  const failedRows = rows.length - passedRows;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const visibleRows = useMemo(() => {
    if (rowFilter === "failed") return rows.filter((row) => !row.passed);
    if (rowFilter === "passed") return rows.filter((row) => row.passed);
    return rows;
  }, [rowFilter, rows]);
  const reconciliationStats = useMemo(() => {
    const periods = new Set(rows.map((row) => row.periodMonth.slice(0, 7)));
    const maxDelta = rows.reduce((largest, row) => Math.max(largest, Math.abs(Number(row.delta))), 0);
    return { periods: periods.size, maxDelta };
  }, [rows]);

  async function importByPath() {
    await importExcel({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
  }

  async function importUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage("Selecione um arquivo .xlsx.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    await importExcel({ method: "POST", body: formData });
  }

  async function importExcel(init: RequestInit) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/import/excel", init);
      const payload = await response.json();
      if (!response.ok || payload.error) {
        setMessage(payload.error ?? "Não foi possível importar a planilha.");
        return;
      }
      const job = {
        id: payload.id,
        fileName: payload.fileName,
        status: payload.status,
        createdAt: payload.createdAt,
        rows: payload.reconciliationRows?.length ?? 0,
        errorMessage: payload.errorMessage ?? null,
      };
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      if (payload.id) await loadReconciliation(payload.id);
      setMessage(`Importação concluída: ${job.rows} reconciliações geradas.`);
    } finally {
      setLoading(false);
    }
  }

  async function loadReconciliation(id: string) {
    setSelectedJobId(id);
    setRowFilter("all");
    const response = await fetch(`/api/import/${id}/reconciliation`);
    const payload = await response.json();
    setRows(Array.isArray(payload) ? payload : []);
  }

  async function loadAuditLogs() {
    const response = await fetch("/api/audit-logs?take=100");
    const payload = await response.json();
    setAuditLogs(Array.isArray(payload) ? payload : []);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
        <h2 className="text-base font-semibold text-white">Importar planilha</h2>
        <p className="mt-2 text-sm text-slate-400">A importação substitui a linha de base importada e recalcula os indicadores no app.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-300">
            Caminho local
            <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} className="mt-2 w-full" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={importByPath} disabled={loading}>
              <Upload className="h-4 w-4" />
              {loading ? "Importando..." : "Importar por caminho"}
            </Button>
            <a href="/api/backup/export" className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan">
              <Download className="h-4 w-4" />
              Exportar backup
            </a>
          </div>
          <div className="rounded-md border border-line bg-ink p-3">
            <div className="text-sm font-medium text-white">Exportar CSV</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {csvBackups.map((dataset) => (
                <a
                  key={dataset.key}
                  href={`/api/backup/export?format=csv&dataset=${dataset.key}`}
                  className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan"
                >
                  <Download className="h-3.5 w-3.5" />
                  {dataset.label}
                </a>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-line bg-ink p-3">
            <label className="block text-sm text-slate-300">
              Upload .xlsx
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-panel2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-100"
              />
            </label>
            <Button onClick={importUpload} disabled={loading} className="mt-3 border border-line bg-panel2 text-white">
              <Upload className="h-4 w-4" />
              Importar upload
            </Button>
          </div>
          {message ? (
            <p className="rounded-md border border-line bg-ink p-3 text-sm text-slate-300">
              {message}
            </p>
          ) : null}
        </div>
        <div className="mt-6 space-y-2">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => loadReconciliation(job.id)}
              className={
                selectedJobId === job.id
                  ? "focus-ring w-full rounded-md border border-cyan bg-ink p-3 text-left"
                  : "focus-ring w-full rounded-md border border-line bg-ink p-3 text-left hover:border-cyan"
              }
            >
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <FileSpreadsheet className="h-4 w-4 text-green" />
                {job.fileName}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {job.status} - {job.rows} linhas - {new Date(job.createdAt).toLocaleString("pt-BR")}
              </div>
              {job.errorMessage ? <div className="mt-1 text-xs text-magenta">{job.errorMessage}</div> : null}
            </button>
          ))}
        </div>
        </Panel>
        <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Reconciliação</h2>
            <p className="mt-1 text-sm text-slate-400">
              {selectedJob ? `${selectedJob.fileName} - ${new Date(selectedJob.createdAt).toLocaleString("pt-BR")}` : "Comparação entre KPIs da planilha e métricas recalculadas pelo app."}
            </p>
          </div>
          {rows.length ? (
            <div className="flex gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-green">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {passedRows} OK
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-magenta">
                <AlertCircle className="h-3.5 w-3.5" />
                {failedRows} falhas
              </span>
            </div>
          ) : null}
        </div>
        {rows.length ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <SummaryTile label="Linhas" value={String(rows.length)} />
              <SummaryTile label="Meses" value={String(reconciliationStats.periods)} />
              <SummaryTile label="Falhas" value={String(failedRows)} tone={failedRows ? "text-magenta" : "text-green"} />
              <SummaryTile label="Maior delta" value={reconciliationStats.maxDelta.toFixed(6)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <FilterButton active={rowFilter === "all"} onClick={() => setRowFilter("all")}>
                Todas
              </FilterButton>
              <FilterButton active={rowFilter === "failed"} onClick={() => setRowFilter("failed")}>
                Falhas
              </FilterButton>
              <FilterButton active={rowFilter === "passed"} onClick={() => setRowFilter("passed")}>
                OK
              </FilterButton>
            </div>
          </>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2">Mês</th>
                <th>Métrica</th>
                <th>Planilha</th>
                <th>App</th>
                <th>Delta</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 text-slate-300">{row.periodMonth.slice(0, 7)}</td>
                  <td className="text-slate-400">{row.metricKey}</td>
                  <td className="text-slate-400">{Number(row.spreadsheetValue).toFixed(4)}</td>
                  <td className="text-slate-400">{Number(row.appValue).toFixed(4)}</td>
                  <td className={row.passed ? "text-green" : "text-magenta"}>{Number(row.delta).toFixed(6)}</td>
                  <td>{row.passed ? "OK" : "Falhou"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma reconciliação carregada.</p> : null}
          {rows.length > 0 && visibleRows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma linha neste filtro.</p> : null}
        </div>
        </Panel>
      </div>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <History className="h-4 w-4 text-cyan" />
              Auditoria recente
            </h2>
            <p className="mt-1 text-sm text-slate-400">Alterações críticas registradas para backup, rastreabilidade e revisão.</p>
          </div>
          <button type="button" onClick={() => void loadAuditLogs()} className="focus-ring rounded-md border border-line p-2 text-slate-300" aria-label="Atualizar auditoria">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2">Data</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Usuário</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2 text-slate-300">{new Date(log.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="text-slate-400">{log.action}</td>
                  <td className="font-mono text-xs text-slate-400">{log.entityType}:{log.entityId.slice(0, 8)}</td>
                  <td className="text-slate-400">{log.user?.name ?? log.user?.email ?? "Sistema"}</td>
                  <td className="text-slate-500">{log.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditLogs.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhum registro de auditoria encontrado.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

function SummaryTile({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "focus-ring rounded-md border border-cyan bg-cyan/10 px-3 py-2 text-xs font-semibold text-white"
          : "focus-ring rounded-md border border-line px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan"
      }
    >
      {children}
    </button>
  );
}
