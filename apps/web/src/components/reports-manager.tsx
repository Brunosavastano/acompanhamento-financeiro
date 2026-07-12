"use client";

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertCircle, Download, FileSpreadsheet, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { clsx } from "clsx";
import { Input } from "@/components/ui";

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

const jobStatusLabels: Record<string, string> = {
  pending: "pendente",
  running: "executando",
  completed: "sucesso",
  failed: "falhou",
};

const actionLabels: Record<string, string> = {
  create: "criou",
  update: "atualizou",
  delete: "removeu",
  revise: "revisou",
  close: "fechou",
  import: "importou",
};

const entityLabels: Record<string, string> = {
  household: "os dados da família",
  person: "uma pessoa",
  account: "uma conta",
  monthly_snapshot: "um fechamento mensal",
  position: "uma posição de saldo",
  debt_cashflow: "um lançamento do cartão",
  budget_item: "um item do orçamento",
  goal: "uma meta",
  goal_progress_snapshot: "o progresso de uma meta",
  interest_rate: "a taxa Selic",
  import_job: "a planilha base",
};

const actionDots: Record<string, string> = {
  create: "bg-positive",
  close: "bg-positive",
  delete: "bg-negative",
  import: "bg-gold",
  revise: "bg-gold",
  update: "bg-info",
};

function describeLog(log: AuditLog) {
  const action = actionLabels[log.action] ?? log.action;
  const entity = entityLabels[log.entityType] ?? log.entityType;
  return `${action} ${entity}`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date).replace(".", "");
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ${time}`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString("pt-BR")} às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

function shortMonthYear(period: string) {
  const date = new Date(period.slice(0, 10));
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${month}/${String(date.getUTCFullYear()).slice(2)}`;
}

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
  const [showAllRows, setShowAllRows] = useState(false);
  const [showCsvOptions, setShowCsvOptions] = useState(false);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const passedRows = rows.filter((row) => row.passed).length;
  const failedRows = rows.filter((row) => !row.passed);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const visibleRows = useMemo(() => {
    if (rowFilter === "failed") return rows.filter((row) => !row.passed);
    if (rowFilter === "passed") return rows.filter((row) => row.passed);
    return rows;
  }, [rowFilter, rows]);

  async function importFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setMessage("Escolha um arquivo .xlsx.");
      return;
    }
    const confirmed = window.confirm(
      `Importar "${file.name}"? A importação substitui a linha de base da planilha e recalcula os indicadores. Os fechamentos feitos no app não são alterados.`,
    );
    if (!confirmed) return;
    const formData = new FormData();
    formData.append("file", file);
    await importExcel({ method: "POST", body: formData });
  }

  async function importByPath() {
    const confirmed = window.confirm(
      "Importar a planilha do caminho do servidor? A importação substitui a linha de base e recalcula os indicadores.",
    );
    if (!confirmed) return;
    await importExcel({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <h2 className="font-display text-lg font-normal text-snow">Importar planilha</h2>
          <p className="mt-2 text-xs leading-[18px] text-muted">
            A importação substitui a linha de base e recalcula todos os indicadores. Os fechamentos feitos no app não são alterados.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            disabled={loading}
            className={clsx(
              "focus-ring mt-4 grid w-full place-items-center rounded-xl border-[1.5px] border-dashed bg-surface-2 p-7 text-center",
              isDragging ? "border-gold" : "border-edge hover:border-gold",
              loading && "opacity-60",
            )}
          >
            {loading ? (
              <Loader2 className="h-[26px] w-[26px] animate-spin text-gold" aria-hidden />
            ) : (
              <UploadCloud className="h-[26px] w-[26px] text-gold" strokeWidth={1.8} aria-hidden />
            )}
            <span className="mt-2.5 block text-[13px] font-semibold text-snow">
              {loading ? "Importando…" : "Arraste o arquivo .xlsx aqui"}
            </span>
            <span className="mt-1 block text-xs text-faint">ou clique para escolher no computador</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          {message ? (
            <p role="status" className="mt-3 rounded-[10px] border border-edge bg-surface-2 px-3.5 py-2.5 text-xs text-body">
              {message}
            </p>
          ) : null}

          {jobs.length > 0 ? (
            <div className="mt-3.5 flex flex-col gap-2">
              {jobs.map((job, index) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => void loadReconciliation(job.id)}
                  className={clsx(
                    "focus-ring flex w-full items-center gap-2.5 rounded-[10px] border px-3.5 py-3 text-left",
                    selectedJobId === job.id ? "border-gold/50 bg-surface-2" : "border-edge-soft bg-surface-2 opacity-70 hover:opacity-100",
                  )}
                >
                  <FileSpreadsheet
                    className={clsx("h-4 w-4 shrink-0", job.status === "failed" ? "text-negative-text" : selectedJobId === job.id ? "text-positive-text" : "text-faint")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-snow">{job.fileName}</span>
                    <span className="block text-[11px] text-faint">
                      {formatDateTime(job.createdAt)} · {job.rows} reconciliações · {jobStatusLabels[job.status] ?? job.status}
                    </span>
                    {job.errorMessage ? <span className="block text-[11px] text-negative-text">{job.errorMessage}</span> : null}
                  </span>
                  {index === 0 ? (
                    <span className="shrink-0 rounded-full bg-positive/[0.12] px-2.5 py-0.5 text-[10px] font-semibold text-positive-text">Atual</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {defaultPath ? (
            <div className="mt-4 border-t border-edge-soft pt-3.5">
              <label className="block text-[11px] font-semibold text-faint">
                Caminho no servidor (uso local)
                <div className="mt-1.5 flex gap-2">
                  <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} className="w-full bg-surface-2 text-xs" />
                  <button
                    type="button"
                    onClick={() => void importByPath()}
                    disabled={loading || !filePath}
                    className="focus-ring shrink-0 rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:opacity-50"
                  >
                    Importar
                  </button>
                </div>
              </label>
            </div>
          ) : null}
        </section>

        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <h2 className="font-display text-lg font-normal text-snow">Backup e exportação</h2>
          <div className="mt-4 flex gap-2.5">
            <a
              href="/api/backup/export"
              className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-gold px-3 py-[11px] text-[13px] font-bold text-sidebar hover:bg-gold-light"
            >
              <Download className="h-[15px] w-[15px]" aria-hidden />
              Backup completo (JSON)
            </a>
            <button
              type="button"
              onClick={() => setShowCsvOptions((current) => !current)}
              className="focus-ring flex-1 rounded-[10px] border border-edge bg-surface-2 px-3 py-[11px] text-[13px] font-semibold text-body hover:border-gold hover:text-snow"
            >
              Exportar CSV…
            </button>
          </div>
          {showCsvOptions ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {csvBackups.map((dataset) => (
                <a
                  key={dataset.key}
                  href={`/api/backup/export?format=csv&dataset=${dataset.key}`}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-edge px-3 py-1.5 text-[11px] font-semibold text-body hover:border-gold hover:text-gold-light"
                >
                  <Download className="h-3 w-3" aria-hidden />
                  {dataset.label}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] leading-[17px] text-faint">
              O CSV pode ser exportado por conjunto: pessoas, contas, snapshots, posições, dívidas, orçamento, metas, taxas e auditoria.
            </p>
          )}
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-normal text-snow">Reconciliação</h2>
              <p className="mt-1.5 text-xs text-muted">
                {selectedJob ? `${selectedJob.fileName} · ${formatDateTime(selectedJob.createdAt)}` : "Planilha × valores recalculados pelo app"}
              </p>
            </div>
            {rows.length > 0 ? (
              <span
                className={clsx(
                  "rounded-full px-3 py-1 text-[11px] font-semibold",
                  failedRows.length === 0 ? "bg-positive/[0.12] text-positive-text" : "bg-negative/[0.12] text-negative-text",
                )}
              >
                {passedRows} de {rows.length} conferem
              </span>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-elevated">
                <span className="bg-positive" style={{ width: `${(passedRows / rows.length) * 100}%` }} />
                <span className="bg-negative" style={{ width: `${(failedRows.length / rows.length) * 100}%` }} />
              </div>

              {failedRows.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2">
                  {failedRows.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center gap-2.5 rounded-[10px] border border-negative/35 bg-negative/[0.06] px-3.5 py-3">
                      <AlertCircle className="h-[15px] w-[15px] shrink-0 text-negative-text" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-snow">
                          {row.metricKey} · {shortMonthYear(row.periodMonth)}
                        </div>
                        <div className="text-[11px] tabular-nums text-muted">
                          planilha {Number(row.spreadsheetValue).toFixed(4)} × app {Number(row.appValue).toFixed(4)} · delta{" "}
                          {Number(row.delta).toFixed(6)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {failedRows.length > 6 ? (
                    <p className="text-[11px] text-faint">…e mais {failedRows.length - 6} divergências na tabela completa.</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-xs text-positive-text">Todas as linhas conferem com a planilha original.</p>
              )}

              <button
                type="button"
                onClick={() => setShowAllRows((current) => !current)}
                className="focus-ring mt-3.5 w-full rounded-[10px] border border-edge py-2.5 text-xs font-semibold text-muted hover:border-muted hover:text-snow"
              >
                {showAllRows ? "Ocultar a tabela de reconciliação" : `Ver as ${rows.length} linhas da reconciliação`}
              </button>

              {showAllRows ? (
                <>
                  <div className="mt-3.5 flex flex-wrap gap-2">
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
                  <div className="mt-3 max-h-[420px] overflow-auto rounded-[10px] border border-edge-soft">
                    <table className="min-w-full text-[13px]">
                      <thead className="sticky top-0 bg-surface-2 text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">Mês</th>
                          <th className="px-3 py-2.5 font-semibold">Métrica</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Planilha</th>
                          <th className="px-3 py-2.5 text-right font-semibold">App</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge-hair">
                        {visibleRows.map((row) => (
                          <tr key={row.id} className={row.passed ? undefined : "bg-negative/[0.05]"}>
                            <td className="px-3 py-2 tabular-nums text-body">{shortMonthYear(row.periodMonth)}</td>
                            <td className="px-3 py-2 text-muted">{row.metricKey}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted">{Number(row.spreadsheetValue).toFixed(4)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted">{Number(row.appValue).toFixed(4)}</td>
                            <td className={clsx("px-3 py-2 text-right tabular-nums", row.passed ? "text-positive-text" : "text-negative-text")}>
                              {Number(row.delta).toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleRows.length === 0 ? <p className="p-4 text-center text-xs text-faint">Nenhuma linha neste filtro.</p> : null}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Nenhuma reconciliação carregada. Importe a planilha para gerar a comparação.</p>
          )}
        </section>

        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-normal text-snow">Atividade recente</h2>
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              className="focus-ring rounded-lg p-1.5 text-faint hover:bg-elevated hover:text-snow"
              aria-label="Atualizar atividade"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mt-4 flex flex-col">
            {auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="relative ml-1.5 border-l-2 border-edge-soft pb-[18px] pl-[22px] last:pb-0">
                <span
                  className={clsx("absolute -left-[5px] top-1 h-2 w-2 rounded-full", actionDots[log.action] ?? "bg-info")}
                  aria-hidden
                />
                <div className="text-xs text-body">
                  <strong className="font-semibold text-snow">{log.user?.name ?? log.user?.email ?? "Sistema"}</strong> {describeLog(log)}
                  {log.reason ? <span className="text-faint"> — {log.reason}</span> : null}
                </div>
                <div className="mt-0.5 text-[11px] text-faint">{formatWhen(log.createdAt)}</div>
              </div>
            ))}
            {auditLogs.length === 0 ? <p className="text-sm text-muted">Nenhum registro de auditoria ainda.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold",
        active ? "bg-elevated text-snow" : "text-muted hover:text-snow",
      )}
    >
      {children}
    </button>
  );
}
