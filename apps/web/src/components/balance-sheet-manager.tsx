"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { clsx } from "clsx";
import { EmptyState } from "@/components/ui";
import { currency, number, percent } from "@/lib/format";

type HistoryRow = {
  id: string;
  month: string;
  periodMonth: string;
  status: string;
  cashTotal: number;
  investmentsTotal: number;
  assetsTotal: number;
  debtPvTotal: number;
  netWorth: number;
  monthlyVariation: number;
  debtToAssets: number;
  reserveMonths: number;
  patrimonialSavingsRate: number;
};

type SnapshotPosition = {
  id: string;
  personId: string;
  accountId: string | null;
  category: "cash" | "benefit" | "investment" | "cashback";
  amount: string | number;
  person: { name: string } | null;
  account: { name: string } | null;
};

type SnapshotDetail = {
  id: string;
  periodMonth: string;
  status: string;
  revisionNumber: number;
  selicAnnual: string | number;
  notes: string | null;
  positions: SnapshotPosition[];
};

const categoryLabels: Record<SnapshotPosition["category"], string> = {
  cash: "Caixa",
  benefit: "Benefício",
  investment: "Investimento",
  cashback: "Cashback",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  closed: "Fechado",
  revised: "Revisado",
};

function shortMonthYear(period: string) {
  const date = new Date(period.slice(0, 10));
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${month}/${String(date.getUTCFullYear()).slice(2)}`;
}

function fullMonthYear(period: string) {
  const date = new Date(period.slice(0, 10));
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getUTCFullYear()}`;
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const text = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return text.toUpperCase();
}

function signedCurrency(value: number) {
  return `${value > 0 ? "+" : ""}${currency(value)}`;
}

export function BalanceSheetManager({ history }: { history: HistoryRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(history.at(-1)?.id ?? null);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => [...history].reverse(), [history]);
  const maxNetWorth = useMemo(() => Math.max(...history.map((row) => row.netWorth), 0), [history]);
  const selectedRow = useMemo(() => history.find((row) => row.id === selectedId) ?? null, [history, selectedId]);

  const personGroups = useMemo(() => {
    if (!detail) return [];
    const groups = new Map<string, { name: string; positions: SnapshotPosition[] }>();
    for (const position of detail.positions) {
      const name = position.person?.name ?? position.personId;
      const group = groups.get(position.personId) ?? { name, positions: [] };
      group.positions.push(position);
      groups.set(position.personId, group);
    }
    const label = (position: SnapshotPosition) => position.account?.name ?? categoryLabels[position.category];
    return [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((group) => ({
        ...group,
        subtotal: group.positions.reduce((sum, position) => sum + Number(position.amount), 0),
        positions: [...group.positions].sort((a, b) => label(a).localeCompare(label(b), "pt-BR")),
      }));
  }, [detail]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetch(`/api/monthly-snapshots/${selectedId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o mês selecionado.");
        setDetail(await response.json());
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setDetail(null);
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o mês.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  async function createRevision() {
    if (!detail || detail.status !== "closed") return;
    setIsRevising(true);
    setError(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${detail.id}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: `Revisão criada a partir da versão ${detail.revisionNumber}` }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Não foi possível criar a revisão.");
      }
      const created = (await response.json()) as { id: string };
      router.push(`/fechamento?snapshot=${created.id}`);
    } catch (reviseError) {
      setError(reviseError instanceof Error ? reviseError.message : "Não foi possível criar a revisão.");
      setIsRevising(false);
    }
  }

  if (history.length === 0) {
    return (
      <EmptyState
        title="Nenhum fechamento ainda"
        description="Feche o primeiro mês (ou importe a planilha em Dados e relatórios) para começar o histórico."
      />
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <section className="min-w-0 overflow-x-auto rounded-[14px] border border-edge bg-surface">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[72px_1fr_120px_96px_64px] items-center gap-3 border-b border-edge-soft bg-surface-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            <span>Mês</span>
            <span>Patrimônio</span>
            <span className="text-right">Variação</span>
            <span className="text-right">Reserva</span>
            <span />
          </div>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={clsx(
                  "grid cursor-pointer grid-cols-[72px_1fr_120px_96px_64px] items-center gap-3 border-b border-edge-hair px-5 py-3 last:border-b-0 hover:bg-[#101A2E]",
                  selected && "bg-[#101A2E]",
                )}
              >
                <div>
                  <div className="text-[13px] font-semibold tabular-nums text-snow">{shortMonthYear(row.periodMonth)}</div>
                  <div className={clsx("text-[11px]", row.status === "revised" ? "text-gold-light" : "text-faint")}>
                    {statusLabels[row.status] ?? row.status}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold tabular-nums text-body">{currency(row.netWorth)}</div>
                  <div className="mt-1.5 h-1 max-w-[220px] rounded-full bg-elevated">
                    <div
                      className="h-1 rounded-full bg-gold"
                      style={{ width: `${maxNetWorth > 0 ? Math.max((row.netWorth / maxNetWorth) * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>
                <span
                  className={clsx(
                    "justify-self-end rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    row.monthlyVariation >= 0 ? "bg-positive/[0.12] text-positive-text" : "bg-negative/[0.12] text-negative-text",
                  )}
                >
                  {signedCurrency(row.monthlyVariation)}
                </span>
                <span className="text-right text-xs tabular-nums text-muted">{number(row.reserveMonths, 1)} meses</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(row.id);
                  }}
                  className="focus-ring justify-self-end rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:border-gold hover:text-gold-light"
                  aria-label={`Abrir detalhes de ${fullMonthYear(row.periodMonth)}`}
                >
                  Abrir
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6 lg:sticky lg:top-24">
        {selectedRow ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-normal text-snow">{fullMonthYear(selectedRow.periodMonth)}</h2>
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  selectedRow.status === "revised" ? "bg-gold/[0.14] text-gold-light" : "bg-positive/[0.12] text-positive-text",
                )}
              >
                {statusLabels[selectedRow.status] ?? selectedRow.status}
                {detail ? ` · rev ${detail.revisionNumber}` : ""}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <DetailKpi label="Patrimônio" value={currency(selectedRow.netWorth)} />
              <DetailKpi
                label="Variação"
                value={signedCurrency(selectedRow.monthlyVariation)}
                tone={selectedRow.monthlyVariation >= 0 ? "positive" : "negative"}
              />
              <DetailKpi label="Dívida / ativos" value={percent(selectedRow.debtToAssets, 1)} />
              <DetailKpi label="Poupança" value={percent(selectedRow.patrimonialSavingsRate, 1)} />
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-faint">Posições do mês</h3>
            {error ? <p className="mt-3 rounded-[10px] border border-negative/40 bg-negative/[0.08] p-3 text-xs text-negative-text">{error}</p> : null}
            {isLoading ? (
              <p className="mt-3 inline-flex items-center gap-2 text-[13px] text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Carregando posições…
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-4">
                {personGroups.map((group) => (
                  <div key={group.name}>
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-snow">
                      <span className="grid h-6 w-6 place-items-center rounded-full border border-edge bg-elevated text-[9px] text-gold">
                        {initials(group.name)}
                      </span>
                      {group.name}
                      <span className="ml-auto font-medium tabular-nums text-muted">{currency(group.subtotal)}</span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5 pl-8">
                      {group.positions.map((position) => (
                        <div key={position.id} className="flex justify-between gap-3 text-xs">
                          <span className="text-muted">
                            {position.account?.name ?? categoryLabels[position.category]}
                            {position.account ? ` · ${categoryLabels[position.category]}` : ""}
                          </span>
                          <span className="tabular-nums text-body">{currency(Number(position.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-edge-soft pt-3.5 text-xs text-muted">
              <span>
                Selic do mês:{" "}
                <strong className="font-semibold tabular-nums text-snow">
                  {detail ? percent(Number(detail.selicAnnual), 2) : "—"}
                </strong>
              </span>
              {detail?.status === "closed" ? (
                <button
                  type="button"
                  onClick={() => void createRevision()}
                  disabled={isRevising}
                  className="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold-light disabled:opacity-60"
                >
                  {isRevising ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                  Criar revisão
                </button>
              ) : null}
              {detail?.status === "revised" ? <span className="text-gold-light">Há uma revisão deste mês em andamento.</span> : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Selecione um mês na lista para ver os detalhes.</p>
        )}
      </section>
    </div>
  );
}

function DetailKpi({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-[10px] border border-edge-soft bg-surface-2 p-3.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div
        className={clsx(
          "mt-1.5 text-[17px] font-semibold tabular-nums",
          tone === "positive" && "text-positive-text",
          tone === "negative" && "text-negative-text",
          !tone && "text-snow",
        )}
      >
        {value}
      </div>
    </div>
  );
}
