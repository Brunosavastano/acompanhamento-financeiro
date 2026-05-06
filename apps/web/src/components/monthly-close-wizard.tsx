"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Check, CreditCard, History, Loader2, Plus, RotateCcw, Save, Trash2, WalletCards } from "lucide-react";
import { Button, Input, Panel, Select } from "@/components/ui";
import { currency, percent } from "@/lib/format";

type AccountSeed = {
  id: string;
  name: string;
  accountType: string;
  personId: string;
  person: { id: string; name: string };
};

type Position = {
  id: string;
  personId: string;
  accountId: string | null;
  category: "cash" | "benefit" | "investment" | "cashback";
  amount: string | number;
  account: { name: string } | null;
  person: { name: string };
};

type Snapshot = {
  id: string;
  periodMonth: string;
  selicAnnual: string | number;
  status: "draft" | "closed" | "revised";
  revisionNumber: number;
  notes: string | null;
  positions: Position[];
};

type Preview = {
  kpis: {
    netWorth: number;
    cashTotal: number;
    investmentsTotal: number;
    debtPvTotal: number;
    monthlyVariation: number;
    debtToAssets: number;
    reserveMonths: number;
    patrimonialSavingsRate: number;
  };
  budget: { monthlySurplus: number };
};

type Review = {
  debt: {
    nominalTotal: number;
    presentValueTotal: number;
    floatGain: number;
    monthlyInvoiceTotal: number;
  };
  budget: {
    incomeTotal: number;
    expenseTotal: number;
    monthlySurplus: number;
    incomeCommitment: number;
    cardMovingAverageAppliedExpense: number;
    cardMovingAverageMonths: number;
  };
};

const statusLabels: Record<Snapshot["status"], string> = {
  draft: "Rascunho",
  closed: "Fechado",
  revised: "Revisado",
};

export function MonthlyCloseWizard({ defaultPeriod, defaultSelicAnnual, accounts }: { defaultPeriod: string; defaultSelicAnnual: string; accounts: AccountSeed[] }) {
  const [periodMonth, setPeriodMonth] = useState(defaultPeriod.slice(0, 7));
  const [selicAnnual, setSelicAnnual] = useState(defaultSelicAnnual);
  const [notes, setNotes] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newPositionAccountId, setNewPositionAccountId] = useState(accounts[0]?.id ?? "");
  const [newPositionAmount, setNewPositionAmount] = useState("");

  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, AccountSeed[]>();
    for (const account of accounts) {
      const list = groups.get(account.person.name) ?? [];
      list.push(account);
      groups.set(account.person.name, list);
    }
    return groups;
  }, [accounts]);

  useEffect(() => {
    void loadSnapshots();
  }, []);

  async function loadSnapshots() {
    const response = await fetch("/api/monthly-snapshots");
    if (!response.ok) return;
    setSnapshots(await response.json());
  }

  async function hydrateSnapshot(id: string, options?: { message?: string }) {
    const response = await fetch(`/api/monthly-snapshots/${id}`);
    if (!response.ok) throw new Error(await readApiError(response));
    const hydrated = (await response.json()) as Snapshot;
    applySnapshot(hydrated, options);
  }

  function applySnapshot(hydrated: Snapshot, options?: { message?: string }) {
    const period = hydrated.periodMonth.slice(0, 7);
    setSnapshot(hydrated);
    setPeriodMonth(period);
    setSelicAnnual(String(hydrated.selicAnnual));
    setNotes(hydrated.notes ?? "");
    setAmounts(Object.fromEntries(hydrated.positions.map((position) => [position.id, String(position.amount)])));
    setPreview(null);
    setReview(null);
    if (options?.message) setMessage(options.message);
    void loadReview(period).catch(() => {
      setReview(null);
      setMessage((current) => current ?? "Nao foi possivel carregar a revisao de dividas e orcamento.");
    });
  }

  async function loadReview(period: string) {
    const [debtResponse, budgetResponse] = await Promise.all([
      fetch(`/api/debts/summary?period_month=${period}`),
      fetch(`/api/budget?period_month=${period}`),
    ]);
    if (!debtResponse.ok || !budgetResponse.ok) throw new Error("Nao foi possivel carregar a revisao de dividas e orcamento.");
    const [debt, budget] = await Promise.all([debtResponse.json(), budgetResponse.json()]);
    setReview({ debt, budget: budget.metrics });
  }

  async function selectSnapshot(event: ChangeEvent<HTMLSelectElement>) {
    const id = event.currentTarget.value;
    setMessage(null);
    if (!id) {
      resetSelection();
      return;
    }
    setLoading(true);
    try {
      await hydrateSnapshot(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar o snapshot.");
    } finally {
      setLoading(false);
    }
  }

  function resetSelection() {
    setSnapshot(null);
    setPreview(null);
    setReview(null);
    setAmounts({});
    setPeriodMonth(defaultPeriod.slice(0, 7));
    setSelicAnnual(defaultSelicAnnual);
    setNotes("");
  }

  async function createDraft() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/monthly-snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodMonth: `${periodMonth}-01`, selicAnnual: Number(selicAnnual), notes: notes || undefined }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = (await response.json()) as Snapshot;
      applySnapshot(created, { message: "Rascunho criado." });
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar o rascunho.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshotMetadata() {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selicAnnual: Number(selicAnnual), notes: notes || null }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const updated = (await response.json()) as Pick<Snapshot, "selicAnnual" | "notes">;
      setSnapshot({ ...snapshot, selicAnnual: updated.selicAnnual, notes: updated.notes });
      setPreview(null);
      await loadReview(periodMonth);
      setMessage("Dados do rascunho salvos. Recalcule a previa antes de fechar.");
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar os dados do rascunho.");
    } finally {
      setLoading(false);
    }
  }

  async function createRevision() {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: `Revisao criada a partir da versao ${snapshot.revisionNumber}` }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = await response.json();
      await hydrateSnapshot(created.id, { message: "Revisao criada como rascunho." });
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar a revisao.");
    } finally {
      setLoading(false);
    }
  }

  async function savePositions() {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      await Promise.all(snapshot.positions.map(async (position) => {
        const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/positions/${position.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            personId: position.personId,
            accountId: position.accountId,
            category: position.category,
            amount: Number(amounts[position.id] ?? 0),
          }),
        });
        if (!response.ok) throw new Error(await readApiError(response));
      }));
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/preview`);
      if (!response.ok) throw new Error(await readApiError(response));
      setPreview(await response.json());
      setMessage("Saldos salvos e previa recalculada.");
      void loadReview(periodMonth).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar os saldos.");
    } finally {
      setLoading(false);
    }
  }

  async function createPosition() {
    if (!snapshot) return;
    const account = accounts.find((item) => item.id === newPositionAccountId);
    if (!account) {
      setMessage("Selecione uma conta para adicionar a posicao.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/positions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId: account.personId,
          accountId: account.id,
          category: positionCategoryFromAccount(account.accountType),
          amount: Number(newPositionAmount || 0),
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = (await response.json()) as Position;
      setNewPositionAmount("");
      setSnapshot((current) => (current ? { ...current, positions: [...current.positions, created] } : current));
      setAmounts((current) => ({ ...current, [created.id]: String(created.amount) }));
      setPreview(null);
      setMessage("Posicao adicionada ao rascunho.");
      void loadReview(periodMonth).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel adicionar a posicao.");
    } finally {
      setLoading(false);
    }
  }

  async function deletePosition(positionId: string) {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/positions/${positionId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response));
      setSnapshot((current) => (current ? { ...current, positions: current.positions.filter((position) => position.id !== positionId) } : current));
      setAmounts((current) => {
        const next = { ...current };
        delete next[positionId];
        return next;
      });
      setPreview(null);
      setMessage("Posicao removida do rascunho.");
      void loadReview(periodMonth).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel remover a posicao.");
    } finally {
      setLoading(false);
    }
  }

  async function closeSnapshot() {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/close`, { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = await response.json();
      setPreview(body.metrics);
      setSnapshot({ ...snapshot, status: "closed" });
      setMessage("Mes fechado com sucesso.");
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel fechar o mes.");
    } finally {
      setLoading(false);
    }
  }

  const canEdit = snapshot?.status === "draft";

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel>
        <h2 className="text-base font-semibold text-white">1. Selecionar mes</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">
            Mes
            <Input value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} type="month" className="mt-2 w-full" disabled={!!snapshot} />
          </label>
          <label className="text-sm text-slate-300">
            Selic anual
            <Input
              value={selicAnnual}
              onChange={(event) => {
                setSelicAnnual(event.target.value);
                setPreview(null);
              }}
              type="number"
              step="0.0001"
              className="mt-2 w-full"
              disabled={!!snapshot && !canEdit}
            />
          </label>
        </div>
        <label className="mt-3 block text-sm text-slate-300">
          Notas do fechamento
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="focus-ring mt-2 min-h-24 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-white"
            disabled={!!snapshot && !canEdit}
            maxLength={2000}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={createDraft} disabled={loading || !!snapshot}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar rascunho
          </Button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void saveSnapshotMetadata()}
              disabled={loading}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Salvar dados
            </button>
          ) : null}
          {snapshot ? (
            <button type="button" onClick={resetSelection} className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan">
              <RotateCcw className="h-4 w-4" />
              Trocar mes
            </button>
          ) : null}
        </div>

        <div className="mt-6 rounded-md border border-line bg-ink p-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-white">Fechamentos existentes</h3>
          </div>
          <Select value={snapshot?.id ?? ""} onChange={selectSnapshot} className="mt-3 w-full" disabled={loading}>
            <option value="">Selecionar snapshot</option>
            {snapshots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.periodMonth.slice(0, 7)} - rev {item.revisionNumber} - {statusLabels[item.status]}
              </option>
            ))}
          </Select>
          {snapshot?.status === "closed" ? (
            <Button onClick={createRevision} disabled={loading} className="mt-3 border border-line bg-panel2 text-white">
              <Plus className="h-4 w-4" />
              Criar revisao
            </Button>
          ) : null}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">Estrutura de contas</h3>
          <div className="mt-3 space-y-3">
            {[...groupedAccounts.entries()].map(([person, list]) => (
              <div key={person} className="rounded-md border border-line bg-ink p-3">
                <div className="text-sm font-medium text-white">{person}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {list.map((account) => (
                    <span key={account.id} className="rounded-md border border-line px-2 py-1 text-xs text-slate-400">
                      {account.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-white">2. Informar saldos e previa</h2>
          {snapshot ? <span className="rounded-md border border-line px-2 py-1 text-xs text-slate-400">{statusLabels[snapshot.status]} rev {snapshot.revisionNumber}</span> : null}
        </div>
        {!snapshot ? (
          <p className="mt-4 text-sm text-slate-400">Crie ou selecione um rascunho para habilitar os saldos por pessoa e conta.</p>
        ) : (
          <>
            {canEdit ? (
              <div className="mt-4 rounded-md border border-line bg-ink p-3">
                <h3 className="text-sm font-semibold text-white">Adicionar posicao manual</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_0.5fr_auto]">
                  <Select value={newPositionAccountId} onChange={(event) => setNewPositionAccountId(event.target.value)} className="w-full">
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.person.name} - {account.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={newPositionAmount}
                    onChange={(event) => setNewPositionAmount(event.target.value)}
                    type="number"
                    step="0.01"
                    placeholder="Valor"
                    className="w-full"
                  />
                  <button
                    type="button"
                    onClick={() => void createPosition()}
                    disabled={loading || !newPositionAccountId || newPositionAmount === ""}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {snapshot.positions.map((position) => (
                <div key={position.id} className="rounded-md border border-line bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <label className="min-w-0 flex-1 text-sm text-slate-300">
                      <span className="block truncate">{position.person.name} - {position.account?.name ?? position.category}</span>
                      <Input
                        value={amounts[position.id] ?? ""}
                        onChange={(event) => setAmounts((current) => ({ ...current, [position.id]: event.target.value }))}
                        type="number"
                        step="0.01"
                        className="mt-2 w-full"
                        disabled={!canEdit}
                      />
                    </label>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void deletePosition(position.id)}
                        disabled={loading}
                        className="focus-ring mt-7 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-slate-400 hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Remover posicao ${position.person.name} ${position.account?.name ?? position.category}`}
                        title="Remover posicao"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={savePositions} disabled={loading || !canEdit}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar e calcular
              </Button>
              <Button onClick={closeSnapshot} disabled={loading || !preview || !canEdit} className="bg-green text-ink">
                <Check className="h-4 w-4" />
                Fechar mes
              </Button>
            </div>
            <div className="mt-6 rounded-md border border-line bg-ink p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">3. Revisar dividas e orcamento</h3>
                  <p className="mt-1 text-sm text-slate-400">Resumo usado na previa antes de fechar {periodMonth}.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/dividas?period_month=${periodMonth}`} className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan">
                    <CreditCard className="h-3.5 w-3.5" />
                    Dividas
                  </Link>
                  <Link href={`/orcamento?period_month=${periodMonth}`} className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan">
                    <WalletCards className="h-3.5 w-3.5" />
                    Orcamento
                  </Link>
                </div>
              </div>
              {review ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric label="Divida PV" value={currency(review.debt.presentValueTotal)} />
                  <Metric label="Fatura do mes" value={currency(review.debt.monthlyInvoiceTotal)} />
                  <Metric label="Float" value={currency(review.debt.floatGain)} />
                  <Metric label="Receita orcada" value={currency(review.budget.incomeTotal)} />
                  <Metric label="Despesa orcada" value={currency(review.budget.expenseTotal)} />
                  <Metric label="Sobra orcada" value={currency(review.budget.monthlySurplus)} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Crie ou selecione um rascunho para carregar a revisao.</p>
              )}
              {review?.budget.cardMovingAverageMonths ? (
                <p className="mt-3 text-xs text-slate-500">
                  Cartao no orcamento: {currency(review.budget.cardMovingAverageAppliedExpense)} pela media movel de {review.budget.cardMovingAverageMonths} mes(es).
                </p>
              ) : null}
            </div>
          </>
        )}
        {preview ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="PL total" value={currency(preview.kpis.netWorth)} />
            <Metric label="Variacao" value={currency(preview.kpis.monthlyVariation)} />
            <Metric label="Divida/ativos" value={percent(preview.kpis.debtToAssets, 1)} />
            <Metric label="Meses reserva" value={String(preview.kpis.reserveMonths.toFixed(2))} />
            <Metric label="Poupanca patrimonial" value={percent(preview.kpis.patrimonialSavingsRate, 1)} />
            <Metric label="Sobra orcamento" value={currency(preview.budget.monthlySurplus)} />
          </div>
        ) : null}
        {message ? <p className="mt-4 rounded-md border border-line bg-ink p-3 text-sm text-slate-300">{message}</p> : null}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function positionCategoryFromAccount(accountType: string): Position["category"] {
  if (accountType === "benefit" || accountType === "investment" || accountType === "cashback") return accountType;
  return "cash";
}

async function readApiError(response: Response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.error ?? text;
  } catch {
    return text || "Erro inesperado.";
  }
}
