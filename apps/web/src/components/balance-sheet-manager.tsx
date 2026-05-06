"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Button, Panel } from "@/components/ui";
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
  source: string;
  person: { name: string } | null;
  account: { name: string; accountType: string } | null;
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

type SnapshotPreview = {
  kpis: {
    cashTotal: number;
    investmentsTotal: number;
    assetsTotal: number;
    debtPvTotal: number;
    netWorth: number;
    monthlyVariation: number;
    debtToAssets: number;
    reserveMonths: number;
    patrimonialSavingsRate: number;
    budgetSavingsRate: number;
  };
  budget: {
    incomeTotal: number;
    expenseTotal: number;
    monthlySurplus: number;
    cardMovingAverageExpense?: number;
    cardMovingAverageApplied?: boolean;
  };
};

const categoryLabels: Record<SnapshotPosition["category"], string> = {
  cash: "Caixa",
  benefit: "Beneficio",
  investment: "Investimento",
  cashback: "Cashback",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  closed: "Fechado",
  revised: "Revisado",
};

export function BalanceSheetManager({ history }: { history: HistoryRow[] }) {
  const initialId = history.at(-1)?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [preview, setPreview] = useState<SnapshotPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRow = useMemo(() => history.find((row) => row.id === selectedId) ?? history.at(-1) ?? null, [history, selectedId]);

  async function loadSnapshot(id: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [detailResponse, previewResponse] = await Promise.all([
        fetch(`/api/monthly-snapshots/${id}`),
        fetch(`/api/monthly-snapshots/${id}/preview`),
      ]);
      if (!detailResponse.ok || !previewResponse.ok) {
        throw new Error("Nao foi possivel carregar o balancete selecionado.");
      }
      setDetail(await detailResponse.json());
      setPreview(await previewResponse.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar balancete.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId) void loadSnapshot(selectedId);
  }, [selectedId]);

  if (history.length === 0) {
    return (
      <Panel>
        <h2 className="text-base font-semibold text-white">Nenhum balancete encontrado</h2>
        <p className="mt-2 text-sm text-slate-400">Importe a planilha ou crie um fechamento mensal para iniciar o historico.</p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-white">Historico mensal</h2>
          <p className="mt-1 text-sm text-slate-400">Selecione um mes para ver contas, pessoas, categorias e indicadores recalculados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel2 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <Th>Mes</Th>
                <Th>Status</Th>
                <Th>Caixa</Th>
                <Th>Investimentos</Th>
                <Th>Divida PV</Th>
                <Th>PL Total</Th>
                <Th>Variacao</Th>
                <Th>D/A</Th>
                <Th>Reserva</Th>
                <Th>Tx. Poup.</Th>
                <Th>Abrir</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((row) => (
                <tr key={row.id} className={row.id === selectedId ? "bg-panel2" : "hover:bg-panel2/50"}>
                  <Td>{row.month}</Td>
                  <Td>{statusLabels[row.status] ?? row.status}</Td>
                  <Td>{currency(row.cashTotal)}</Td>
                  <Td>{currency(row.investmentsTotal)}</Td>
                  <Td>{currency(row.debtPvTotal)}</Td>
                  <Td className="font-semibold text-white">{currency(row.netWorth)}</Td>
                  <Td className={row.monthlyVariation >= 0 ? "text-green" : "text-magenta"}>{currency(row.monthlyVariation)}</Td>
                  <Td>{percent(row.debtToAssets, 1)}</Td>
                  <Td>{number(row.reserveMonths, 2)}</Td>
                  <Td>{percent(row.patrimonialSavingsRate, 1)}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-400 hover:border-cyan hover:text-white"
                      aria-label={`Abrir balancete ${row.month}`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">{selectedRow ? `Balancete ${selectedRow.month}` : "Balancete"}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {detail ? `${statusLabels[detail.status] ?? detail.status} - revisao ${detail.revisionNumber}` : "Carregando detalhamento"}
            </p>
          </div>
          {selectedId ? (
            <Button type="button" onClick={() => void loadSnapshot(selectedId)} disabled={isLoading} className="px-3">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          ) : null}
        </div>

        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}

        {preview ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="PL total" value={currency(preview.kpis.netWorth)} tone="text-cyan" />
            <Metric label="Ativos" value={currency(preview.kpis.assetsTotal)} />
            <Metric label="Divida PV" value={currency(preview.kpis.debtPvTotal)} />
            <Metric label="Reserva" value={`${number(preview.kpis.reserveMonths, 2)} meses`} />
            <Metric label="Poupanca patrimonial" value={percent(preview.kpis.patrimonialSavingsRate, 1)} />
            <Metric label="Poupanca orcamentaria" value={percent(preview.kpis.budgetSavingsRate, 1)} />
          </div>
        ) : null}

        {preview?.budget ? (
          <div className="mt-4 rounded-md border border-line bg-ink p-3 text-sm text-slate-300">
            <div className="grid gap-2 sm:grid-cols-2">
              <span>Receita: {currency(preview.budget.incomeTotal)}</span>
              <span>Despesa: {currency(preview.budget.expenseTotal)}</span>
              <span>Sobra: {currency(preview.budget.monthlySurplus)}</span>
              <span>
                Cartao media: {currency(preview.budget.cardMovingAverageExpense ?? 0)}
                {preview.budget.cardMovingAverageApplied === false ? " (ja coberto)" : ""}
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-white">Posicoes</h3>
          <div className="mt-2 max-h-[520px] overflow-auto rounded-md border border-line">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-panel2 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <Th>Conta</Th>
                  <Th>Pessoa</Th>
                  <Th>Categoria</Th>
                  <Th>Valor</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail?.positions.map((position) => (
                  <tr key={position.id}>
                    <Td>{position.account?.name ?? "Sem conta"}</Td>
                    <Td>{position.person?.name ?? position.personId}</Td>
                    <Td>{categoryLabels[position.category]}</Td>
                    <Td className="font-medium text-white">{currency(Number(position.amount))}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!detail && !isLoading ? <p className="p-4 text-sm text-slate-400">Selecione um mes para carregar as posicoes.</p> : null}
            {isLoading ? <p className="p-4 text-sm text-slate-400">Carregando balancete...</p> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Metric({ label, tone = "text-white", value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-slate-300 ${className}`}>{children}</td>;
}
