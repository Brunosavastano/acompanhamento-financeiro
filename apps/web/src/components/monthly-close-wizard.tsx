"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  History,
  ImageUp,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  WalletCards,
} from "lucide-react";
import { clsx } from "clsx";
import { Button, Input, Select } from "@/components/ui";
import { currency, number, percent } from "@/lib/format";

function signedCurrency(value: number) {
  return `${value > 0 ? "+" : ""}${currency(value)}`;
}

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

const categoryLabels: Record<Position["category"], string> = {
  cash: "Caixa",
  benefit: "Benefício",
  investment: "Investimento",
  cashback: "Cashback",
};

const steps = ["Mês e Selic", "Saldos por conta", "Revisão", "Fechamento"];

function monthName(period: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(period.length === 7 ? `${period}-01` : period));
}

function shortMonth(period: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(period.length === 7 ? `${period}-01` : period.slice(0, 10)))
    .replace(".", "");
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const text = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return text.toUpperCase();
}

export function MonthlyCloseWizard({
  defaultPeriod,
  defaultSelicAnnual,
  accounts,
  initialSnapshotId,
}: {
  defaultPeriod: string;
  defaultSelicAnnual: string;
  accounts: AccountSeed[];
  initialSnapshotId?: string;
}) {
  const [step, setStep] = useState(1);
  const [periodMonth, setPeriodMonth] = useState(defaultPeriod.slice(0, 7));
  const [selicAnnual, setSelicAnnual] = useState(defaultSelicAnnual);
  const [selicStatus, setSelicStatus] = useState("Selic Bacen carregada para o mês selecionado.");
  const [selicLoading, setSelicLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [addingPosition, setAddingPosition] = useState(false);
  const [newPositionAccountId, setNewPositionAccountId] = useState(accounts[0]?.id ?? "");
  const [newPositionAmount, setNewPositionAmount] = useState("");

  const canEdit = snapshot?.status === "draft";

  const personGroups = useMemo(() => {
    if (!snapshot) return [];
    const groups = new Map<string, { name: string; positions: Position[] }>();
    for (const position of snapshot.positions) {
      const group = groups.get(position.personId) ?? { name: position.person.name, positions: [] };
      group.positions.push(position);
      groups.set(position.personId, group);
    }
    // As posições vêm sem ordem estável do banco (createdAt empata no lote inicial).
    const label = (position: Position) => position.account?.name ?? categoryLabels[position.category];
    return [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((group) => ({
        ...group,
        positions: [...group.positions].sort((a, b) => label(a).localeCompare(label(b), "pt-BR")),
      }));
  }, [snapshot]);

  /** Último fechamento anterior ao mês em edição, para conferência e "copiar saldos". */
  const previousReference = useMemo(() => {
    const current = snapshot ? snapshot.periodMonth.slice(0, 10) : `${periodMonth}-01`;
    const latest = snapshots.find(
      (item) => (item.status === "closed" || item.status === "revised") && item.periodMonth.slice(0, 10) < current,
    );
    if (!latest) return null;
    const byAccount = new Map<string, string>();
    for (const position of latest.positions) {
      if (position.accountId && !byAccount.has(position.accountId)) byAccount.set(position.accountId, String(position.amount));
    }
    return { periodMonth: latest.periodMonth, label: shortMonth(latest.periodMonth), byAccount };
  }, [snapshots, snapshot, periodMonth]);

  useEffect(() => {
    void loadSnapshots();
  }, []);

  // Permite chegar com um snapshot pré-selecionado (ex.: "Criar revisão" no Histórico).
  useEffect(() => {
    if (!initialSnapshotId) return;
    setLoading(true);
    hydrateSnapshot(initialSnapshotId, { goToStep: 2 })
      .catch(() => setMessage("Não foi possível carregar o fechamento indicado no link."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSnapshotId]);

  useEffect(() => {
    if (snapshot) return;
    const controller = new AbortController();
    void loadSelicForPeriod(periodMonth, controller.signal);
    return () => controller.abort();
  }, [periodMonth, snapshot]);

  async function loadSnapshots() {
    const response = await fetch("/api/monthly-snapshots");
    if (!response.ok) return;
    setSnapshots(await response.json());
  }

  async function hydrateSnapshot(id: string, options?: { message?: string; goToStep?: number }) {
    const response = await fetch(`/api/monthly-snapshots/${id}`);
    if (!response.ok) throw new Error(await readApiError(response));
    const hydrated = (await response.json()) as Snapshot;
    applySnapshot(hydrated, options);
  }

  function applySnapshot(hydrated: Snapshot, options?: { message?: string; goToStep?: number }) {
    const period = hydrated.periodMonth.slice(0, 7);
    setSnapshot(hydrated);
    setPeriodMonth(period);
    setSelicAnnual(String(hydrated.selicAnnual));
    setSelicStatus("Selic gravada no rascunho.");
    setNotes(hydrated.notes ?? "");
    setAmounts(Object.fromEntries(hydrated.positions.map((position) => [position.id, String(position.amount)])));
    setPreview(null);
    setReview(null);
    setAddingPosition(false);
    if (options?.message) setMessage(options.message);
    if (options?.goToStep) setStep(options.goToStep);
    void loadReview(period).catch(() => {
      setReview(null);
      setMessage((current) => current ?? "Não foi possível carregar a revisão de dívidas e orçamento.");
    });
  }

  async function loadReview(period: string) {
    const [debtResponse, budgetResponse] = await Promise.all([
      fetch(`/api/debts/summary?period_month=${period}`),
      fetch(`/api/budget?period_month=${period}`),
    ]);
    if (!debtResponse.ok || !budgetResponse.ok) throw new Error("Não foi possível carregar a revisão de dívidas e orçamento.");
    const [debt, budget] = await Promise.all([debtResponse.json(), budgetResponse.json()]);
    setReview({ debt, budget: budget.metrics });
  }

  async function loadSelicForPeriod(period: string, signal?: AbortSignal) {
    setSelicLoading(true);
    try {
      const response = await fetch(`/api/interest-rates/selic?period_month=${period}`, { signal });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as { annualRate: string; providerDate: string | null; fallback: boolean };
      setSelicAnnual(String(body.annualRate));
      setSelicStatus(
        body.fallback
          ? "Bacen indisponível; usando a última Selic salva."
          : body.providerDate
            ? `Bacen SGS 432, observação de ${body.providerDate}.`
            : "Bacen SGS 432.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSelicStatus("Não foi possível atualizar a Selic agora; mantendo o valor carregado.");
    } finally {
      if (!signal?.aborted) setSelicLoading(false);
    }
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
      const selected = snapshots.find((item) => item.id === id);
      await hydrateSnapshot(id, { goToStep: selected?.status === "draft" ? 2 : 4 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o snapshot.");
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
    setSelicStatus("Selic Bacen carregada para o mês selecionado.");
    setNotes("");
    setAddingPosition(false);
    setStep(1);
  }

  async function createDraft() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/monthly-snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodMonth: `${periodMonth}-01`, notes: notes || undefined }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = (await response.json()) as Snapshot;
      applySnapshot(created, { message: "Rascunho criado. Informe os saldos por conta.", goToStep: 2 });
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o rascunho.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSnapshotSelic() {
    if (!snapshot) {
      await loadSelicForPeriod(periodMonth);
      return;
    }
    setLoading(true);
    setSelicLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshSelic: true, notes: notes || null }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const updated = (await response.json()) as Pick<Snapshot, "selicAnnual" | "notes">;
      setSnapshot({ ...snapshot, selicAnnual: updated.selicAnnual, notes: updated.notes });
      setSelicAnnual(String(updated.selicAnnual));
      setSelicStatus("Selic atualizada pelo Bacen e gravada no rascunho.");
      setPreview(null);
      await loadReview(periodMonth);
      setMessage("Selic atualizada pelo Bacen. Salve os saldos para recalcular a prévia.");
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a Selic pelo Bacen.");
    } finally {
      setSelicLoading(false);
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
        body: JSON.stringify({ notes: `Revisão criada a partir da versão ${snapshot.revisionNumber}` }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = await response.json();
      await hydrateSnapshot(created.id, { message: "Revisão criada como rascunho.", goToStep: 2 });
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a revisão.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteDraft() {
    if (!snapshot || snapshot.status !== "draft") return;
    const confirmed = window.confirm("Excluir este rascunho? Os saldos informados nele serão descartados.");
    if (!confirmed) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monthly-snapshots/${snapshot.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response));
      resetSelection();
      await loadSnapshots();
      setMessage("Rascunho excluído.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o rascunho.");
    } finally {
      setLoading(false);
    }
  }

  function copyPreviousBalances() {
    if (!snapshot || !previousReference) return;
    setAmounts((current) => {
      const next = { ...current };
      for (const position of snapshot.positions) {
        if (position.accountId && previousReference.byAccount.has(position.accountId)) {
          next[position.id] = previousReference.byAccount.get(position.accountId)!;
        }
      }
      return next;
    });
    setPreview(null);
    setMessage(`Saldos de ${monthName(previousReference.periodMonth)} copiados. Confira, ajuste e salve.`);
  }

  async function persistPositionsAndPreview() {
    if (!snapshot) return;
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
    const notesResponse = await fetch(`/api/monthly-snapshots/${snapshot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes || null }),
    });
    if (!notesResponse.ok) throw new Error(await readApiError(notesResponse));
    const response = await fetch(`/api/monthly-snapshots/${snapshot.id}/preview`);
    if (!response.ok) throw new Error(await readApiError(response));
    setPreview(await response.json());
    void loadReview(periodMonth).catch(() => undefined);
  }

  async function savePositions(options?: { goToStep?: number }) {
    if (!snapshot) return;
    setLoading(true);
    setMessage(null);
    try {
      await persistPositionsAndPreview();
      setMessage("Saldos e notas salvos; prévia recalculada.");
      if (options?.goToStep) setStep(options.goToStep);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar os saldos.");
    } finally {
      setLoading(false);
    }
  }

  async function createPosition() {
    if (!snapshot) return;
    const account = accounts.find((item) => item.id === newPositionAccountId);
    if (!account) {
      setMessage("Selecione uma conta para adicionar a posição.");
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
      setAddingPosition(false);
      setSnapshot((current) => (current ? { ...current, positions: [...current.positions, created] } : current));
      setAmounts((current) => ({ ...current, [created.id]: String(created.amount) }));
      setPreview(null);
      setMessage("Posição adicionada ao rascunho.");
      void loadReview(periodMonth).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar a posição.");
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
      setMessage("Posição removida do rascunho.");
      void loadReview(periodMonth).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a posição.");
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
      setMessage("Mês fechado com sucesso.");
      await loadSnapshots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível fechar o mês.");
    } finally {
      setLoading(false);
    }
  }

  function updateAmount(positionId: string, value: string) {
    setAmounts((current) => ({ ...current, [positionId]: value }));
    setPreview(null);
  }

  function stepEnabled(target: number) {
    if (target === 1) return true;
    if (!snapshot) return false;
    if (target === 2) return true;
    return canEdit ? preview !== null : true;
  }

  const currentMonthName = monthName(periodMonth);

  return (
    <div>
      <Stepper step={step} onNavigate={(target) => stepEnabled(target) && setStep(target)} stepEnabled={stepEnabled} />

      {message ? (
        <p role="status" className="mb-6 rounded-[10px] border border-edge bg-surface-2 px-4 py-3 text-[13px] text-body">
          {message}
        </p>
      ) : null}

      {step === 1 ? (
        <Step1MonthSelic
          periodMonth={periodMonth}
          setPeriodMonth={setPeriodMonth}
          snapshot={snapshot}
          snapshots={snapshots}
          onSelectSnapshot={selectSnapshot}
          onCreateDraft={createDraft}
          onDeleteDraft={deleteDraft}
          onCreateRevision={createRevision}
          onReset={resetSelection}
          onContinue={() => setStep(2)}
          loading={loading}
          selic={{ value: selicAnnual, status: selicStatus, loading: selicLoading, refresh: refreshSnapshotSelic }}
          accounts={accounts}
        />
      ) : null}

      {step === 2 && snapshot ? (
        <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Informe quanto havia em cada conta no fim de {currentMonthName}.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={copyPreviousBalances}
                  disabled={!previousReference || loading}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge bg-surface px-3.5 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {previousReference ? `Copiar saldos de ${monthName(previousReference.periodMonth)}` : "Sem mês anterior para copiar"}
                </button>
              ) : null}
            </div>

            {personGroups.map((group) => (
              <section key={group.name} className="overflow-hidden rounded-[14px] border border-edge bg-surface">
                <div className="flex items-center gap-3 border-b border-edge-soft bg-surface-2 px-5 py-3.5">
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full border border-edge bg-elevated text-[11px] font-semibold text-gold">
                    {initials(group.name)}
                  </span>
                  <span className="text-sm font-semibold text-snow">{group.name}</span>
                  <span className="ml-auto text-xs text-muted">
                    Subtotal{" "}
                    <strong className="font-semibold tabular-nums text-snow">
                      {currency(group.positions.reduce((sum, position) => sum + Number(amounts[position.id] ?? 0), 0))}
                    </strong>
                  </span>
                </div>
                <div className="flex flex-col px-5 pb-4 pt-2">
                  {group.positions.map((position) => (
                    <div
                      key={position.id}
                      className="grid grid-cols-[1fr_140px] items-center gap-3 border-b border-edge-hair py-3 last:border-b-0 sm:grid-cols-[1fr_170px_110px_32px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-body">{position.account?.name ?? categoryLabels[position.category]}</div>
                        <div className="text-[11px] text-faint">{categoryLabels[position.category]}</div>
                      </div>
                      <input
                        value={amounts[position.id] ?? ""}
                        onChange={(event) => updateAmount(position.id, event.target.value)}
                        type="number"
                        step="0.01"
                        disabled={!canEdit}
                        aria-label={`Saldo de ${position.person.name} — ${position.account?.name ?? categoryLabels[position.category]}`}
                        className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-right text-sm font-semibold tabular-nums text-snow focus:border-gold focus:outline-none disabled:opacity-60"
                      />
                      <span className="hidden text-right text-[11px] tabular-nums text-faint sm:block">
                        {previousReference && position.accountId && previousReference.byAccount.has(position.accountId)
                          ? `${previousReference.label}: ${currency(Number(previousReference.byAccount.get(position.accountId)))}`
                          : "—"}
                      </span>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void deletePosition(position.id)}
                          disabled={loading}
                          aria-label={`Remover posição ${position.account?.name ?? categoryLabels[position.category]}`}
                          title="Remover posição"
                          className="focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-elevated hover:text-negative-text disabled:opacity-50 sm:inline-flex"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {canEdit ? (
              addingPosition ? (
                <div className="rounded-[14px] border border-edge bg-surface p-4">
                  <div className="text-[13px] font-semibold text-snow">Adicionar posição avulsa</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px_auto_auto]">
                    <Select value={newPositionAccountId} onChange={(event) => setNewPositionAccountId(event.target.value)} className="w-full bg-surface-2">
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.person.name} — {account.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={newPositionAmount}
                      onChange={(event) => setNewPositionAmount(event.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="Valor"
                      className="w-full bg-surface-2 text-right tabular-nums"
                    />
                    <Button onClick={() => void createPosition()} disabled={loading || !newPositionAccountId || newPositionAmount === ""}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Adicionar
                    </Button>
                    <button
                      type="button"
                      onClick={() => setAddingPosition(false)}
                      className="focus-ring rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-body hover:border-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingPosition(true)}
                  className="focus-ring inline-flex items-center gap-2 self-start rounded-[10px] border border-dashed border-edge px-4 py-2.5 text-[13px] font-medium text-muted hover:border-gold hover:text-gold-light"
                >
                  <Plus className="h-[15px] w-[15px]" aria-hidden />
                  Adicionar posição avulsa
                </button>
              )
            ) : null}

            <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-edge bg-surface/40 p-4">
              <ImageUp className="h-5 w-5 shrink-0 text-faint" aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-body">
                  Preencher com prints das contas
                  <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Em breve
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-faint">
                  Arraste screenshots dos apps dos bancos e o assistente lê os saldos e preenche os campos para você conferir.
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
            <PreviewCard
              title={`Prévia de ${currentMonthName}`}
              preview={preview}
              previousLabel={previousReference ? monthName(previousReference.periodMonth) : null}
              selic={{ value: selicAnnual, status: selicStatus, loading: selicLoading, refresh: refreshSnapshotSelic, canRefresh: canEdit }}
            />

            <section className="rounded-[14px] border border-edge bg-surface p-5">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Notas do fechamento
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ex.: 13º parcial entrou neste mês…"
                  maxLength={2000}
                  disabled={!canEdit}
                  className="mt-2.5 block min-h-[74px] w-full resize-y rounded-lg border border-edge bg-surface-2 px-3 py-2.5 text-[13px] text-snow placeholder:text-faint focus:border-gold focus:outline-none disabled:opacity-60"
                />
              </label>
            </section>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="focus-ring flex-1 rounded-[10px] border border-edge bg-surface py-3 text-[13px] font-semibold text-body hover:border-muted hover:text-snow"
              >
                <ArrowLeft className="mr-2 inline h-[15px] w-[15px]" aria-hidden />
                Voltar
              </button>
              <button
                type="button"
                onClick={() => (canEdit ? void savePositions({ goToStep: 3 }) : setStep(3))}
                disabled={loading}
                className="focus-ring flex-[2] rounded-[10px] bg-gold py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="mr-2 inline h-[15px] w-[15px] animate-spin" aria-hidden />
                ) : null}
                {canEdit ? "Salvar e revisar" : "Ver revisão"}
                <ArrowRight className="ml-2 inline h-[15px] w-[15px]" aria-hidden />
              </button>
            </div>
            <p className="text-center text-[11px] leading-[17px] text-faint">
              O mês só é fechado no passo 4, depois da revisão de dívidas e orçamento. Fechamentos são imutáveis — ajustes viram revisões.
            </p>
          </div>
        </div>
      ) : null}

      {step === 3 && snapshot ? (
        <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-[14px] border border-edge bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-normal text-snow">Cartão e dívidas</h2>
                  <p className="mt-1 text-xs text-faint">Como entram no cálculo de {currentMonthName}.</p>
                </div>
                <Link
                  href={`/dividas?period_month=${periodMonth}`}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow"
                >
                  <CreditCard className="h-3.5 w-3.5" aria-hidden />
                  Ajustar dívidas
                </Link>
              </div>
              {review ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric label="Dívida a valor presente" value={currency(review.debt.presentValueTotal)} />
                  <Metric label="Fatura do mês" value={currency(review.debt.monthlyInvoiceTotal)} />
                  <Metric label="Ganho de float" value={currency(review.debt.floatGain)} tone="positive" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-faint">Carregando a revisão de dívidas…</p>
              )}
            </section>

            <section className="rounded-[14px] border border-edge bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-normal text-snow">Orçamento</h2>
                  <p className="mt-1 text-xs text-faint">Receitas e despesas projetadas para o mês.</p>
                </div>
                <Link
                  href={`/orcamento?period_month=${periodMonth}`}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow"
                >
                  <WalletCards className="h-3.5 w-3.5" aria-hidden />
                  Ajustar orçamento
                </Link>
              </div>
              {review ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Receita orçada" value={currency(review.budget.incomeTotal)} />
                    <Metric label="Despesa orçada" value={currency(review.budget.expenseTotal)} />
                    <Metric label="Sobra orçada" value={currency(review.budget.monthlySurplus)} tone={review.budget.monthlySurplus >= 0 ? "positive" : "negative"} />
                  </div>
                  {review.budget.cardMovingAverageMonths ? (
                    <p className="mt-3 text-xs text-faint">
                      O cartão entra no orçamento por {currency(review.budget.cardMovingAverageAppliedExpense)}, pela média móvel de{" "}
                      {review.budget.cardMovingAverageMonths} mês(es).
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-4 text-sm text-faint">Carregando a revisão de orçamento…</p>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
            <PreviewCard
              title={`Prévia de ${currentMonthName}`}
              preview={preview}
              previousLabel={previousReference ? monthName(previousReference.periodMonth) : null}
              selic={{ value: selicAnnual, status: selicStatus, loading: selicLoading, refresh: refreshSnapshotSelic, canRefresh: canEdit }}
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="focus-ring flex-1 rounded-[10px] border border-edge bg-surface py-3 text-[13px] font-semibold text-body hover:border-muted hover:text-snow"
              >
                <ArrowLeft className="mr-2 inline h-[15px] w-[15px]" aria-hidden />
                Voltar
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="focus-ring flex-[2] rounded-[10px] bg-gold py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light"
              >
                Ir para o fechamento
                <ArrowRight className="ml-2 inline h-[15px] w-[15px]" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 && snapshot ? (
        <div className="mx-auto max-w-xl">
          {snapshot.status === "draft" ? (
            <section className="rounded-[14px] border border-edge bg-surface p-7">
              <h2 className="font-display text-lg font-normal text-snow">Fechar {currentMonthName}</h2>
              <div className="mt-5 flex flex-col gap-2.5 text-[13px]">
                <SummaryRow label="Patrimônio estimado" value={preview ? currency(preview.kpis.netWorth) : "—"} />
                <SummaryRow
                  label={previousReference ? `Variação vs ${monthName(previousReference.periodMonth)}` : "Variação no mês"}
                  value={preview ? signedCurrency(preview.kpis.monthlyVariation) : "—"}
                  tone={preview && preview.kpis.monthlyVariation >= 0 ? "positive" : "negative"}
                />
                <SummaryRow label="Selic anual gravada" value={percent(Number(selicAnnual), 2)} />
                <SummaryRow label="Notas" value={notes || "Sem notas."} muted />
              </div>
              <p className="mt-6 rounded-[10px] border border-gold/35 bg-gold/[0.08] px-4 py-3 text-xs leading-[18px] text-gold-light">
                Fechamentos são imutáveis: depois de fechar, os saldos deste mês não podem ser editados. Se precisar corrigir algo, o app cria uma
                revisão preservando o histórico.
              </p>
              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="focus-ring flex-1 rounded-[10px] border border-edge bg-surface py-3 text-[13px] font-semibold text-body hover:border-muted hover:text-snow"
                >
                  <ArrowLeft className="mr-2 inline h-[15px] w-[15px]" aria-hidden />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void closeSnapshot()}
                  disabled={loading || !preview}
                  className="focus-ring flex-[2] rounded-[10px] bg-gold py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="mr-2 inline h-[15px] w-[15px] animate-spin" aria-hidden /> : <Check className="mr-2 inline h-[15px] w-[15px]" aria-hidden />}
                  Fechar {currentMonthName}
                </button>
              </div>
              {!preview ? (
                <p className="mt-3 text-center text-[11px] text-faint">Salve os saldos no passo 2 para calcular a prévia antes de fechar.</p>
              ) : null}
            </section>
          ) : (
            <section className="rounded-[14px] border border-edge bg-surface p-7 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-positive/40 bg-positive/[0.15]">
                <Check className="h-6 w-6 text-positive-text" aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-xl font-normal text-snow">
                {monthName(snapshot.periodMonth)} está {statusLabels[snapshot.status].toLowerCase()}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-5 text-muted">
                Os saldos deste mês estão preservados no histórico. Para corrigir algum valor, crie uma revisão — o fechamento original continua
                registrado.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Link
                  href={`/dashboard?period_month=${periodMonth}`}
                  className="focus-ring rounded-[10px] bg-gold px-5 py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light"
                >
                  Ver na Visão geral
                </Link>
                <button
                  type="button"
                  onClick={() => void createRevision()}
                  disabled={loading}
                  className="focus-ring rounded-[10px] border border-edge bg-surface px-5 py-3 text-[13px] font-semibold text-body hover:border-gold hover:text-snow disabled:opacity-60"
                >
                  {loading ? <Loader2 className="mr-2 inline h-[15px] w-[15px] animate-spin" aria-hidden /> : null}
                  Criar revisão
                </button>
                <button
                  type="button"
                  onClick={resetSelection}
                  className="focus-ring rounded-[10px] border border-edge bg-surface px-5 py-3 text-[13px] font-semibold text-body hover:border-muted hover:text-snow"
                >
                  Fechar outro mês
                </button>
              </div>
            </section>
          )}
        </div>
      ) : null}

      {step > 1 && !snapshot ? (
        <p className="text-sm text-muted">Crie ou selecione um rascunho no passo 1 para continuar.</p>
      ) : null}
    </div>
  );
}

function Stepper({ step, onNavigate, stepEnabled }: { step: number; onNavigate: (target: number) => void; stepEnabled: (target: number) => boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-y-3">
      {steps.map((label, index) => {
        const target = index + 1;
        const done = target < step;
        const current = target === step;
        return (
          <div key={label} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onNavigate(target)}
              disabled={!stepEnabled(target)}
              className="focus-ring flex items-center gap-2.5 rounded-full disabled:cursor-not-allowed"
              aria-current={current ? "step" : undefined}
            >
              <span
                className={clsx(
                  "grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-semibold",
                  done && "border border-positive/40 bg-positive/[0.15] text-positive-text",
                  current && "bg-gold font-bold text-sidebar",
                  !done && !current && "border border-edge bg-surface text-faint",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : target}
              </span>
              <span
                className={clsx(
                  "whitespace-nowrap text-[13px]",
                  done && "font-semibold text-positive-text",
                  current && "font-semibold text-snow",
                  !done && !current && "font-medium text-faint",
                )}
              >
                {label}
              </span>
            </button>
            {target < steps.length ? <span className={clsx("mx-3.5 h-px flex-1", done ? "bg-edge" : "bg-edge-soft")} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function PreviewCard({
  title,
  preview,
  previousLabel,
  selic,
}: {
  title: string;
  preview: Preview | null;
  previousLabel: string | null;
  selic: { value: string; status: string; loading: boolean; refresh: () => void; canRefresh: boolean };
}) {
  return (
    <section className="rounded-[14px] border border-gold/35 bg-gradient-to-br from-gold/[0.08] to-surface/40 p-[22px]">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{title}</div>
      {preview ? (
        <>
          <div className="mt-3 text-3xl font-semibold tabular-nums text-snow">{currency(preview.kpis.netWorth)}</div>
          <div className="mt-1 text-xs text-muted">patrimônio estimado com os saldos informados</div>
          <div className="mt-4 flex flex-col gap-2.5 text-[13px]">
            <SummaryRow
              label={previousLabel ? `Variação vs ${previousLabel}` : "Variação no mês"}
              value={signedCurrency(preview.kpis.monthlyVariation)}
              tone={preview.kpis.monthlyVariation >= 0 ? "positive" : "negative"}
            />
            <SummaryRow label="Meses de reserva" value={number(preview.kpis.reserveMonths, 1)} />
            <SummaryRow label="Dívida / ativos" value={percent(preview.kpis.debtToAssets, 1)} />
            <SummaryRow label="Sobra do orçamento" value={currency(preview.budget.monthlySurplus)} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-muted">
          Salve os saldos ("Salvar e revisar") para o app recalcular o patrimônio, a reserva e os demais indicadores deste mês.
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gold/20 pt-3.5">
        <div>
          <div className="text-xs text-muted">Selic anual · Bacen SGS 432</div>
          <div className="text-base font-semibold tabular-nums text-snow">{percent(Number(selic.value), 2)}</div>
          <div className="mt-0.5 max-w-[200px] text-[10px] leading-[14px] text-faint">{selic.status}</div>
        </div>
        {selic.canRefresh ? (
          <button
            type="button"
            onClick={selic.refresh}
            disabled={selic.loading}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-edge bg-night/50 px-3 py-1.5 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:opacity-60"
          >
            {selic.loading ? <Loader2 className="h-[13px] w-[13px] animate-spin" aria-hidden /> : <RotateCcw className="h-[13px] w-[13px]" aria-hidden />}
            Atualizar
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Step1MonthSelic({
  periodMonth,
  setPeriodMonth,
  snapshot,
  snapshots,
  onSelectSnapshot,
  onCreateDraft,
  onDeleteDraft,
  onCreateRevision,
  onReset,
  onContinue,
  loading,
  selic,
  accounts,
}: {
  periodMonth: string;
  setPeriodMonth: (value: string) => void;
  snapshot: Snapshot | null;
  snapshots: Snapshot[];
  onSelectSnapshot: (event: ChangeEvent<HTMLSelectElement>) => void;
  onCreateDraft: () => void;
  onDeleteDraft: () => void;
  onCreateRevision: () => void;
  onReset: () => void;
  onContinue: () => void;
  loading: boolean;
  selic: { value: string; status: string; loading: boolean; refresh: () => void };
  accounts: AccountSeed[];
}) {
  const peopleAccounts = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const account of accounts) {
      const list = groups.get(account.person.name) ?? [];
      list.push(account.name);
      groups.set(account.person.name, list);
    }
    return [...groups.entries()];
  }, [accounts]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <h2 className="font-display text-lg font-normal text-snow">Qual mês vamos fechar?</h2>
          <p className="mt-1 text-[13px] text-muted">O app sugere o mês seguinte ao último fechamento.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Mês de referência
              <Input
                value={periodMonth}
                onChange={(event) => setPeriodMonth(event.target.value)}
                type="month"
                disabled={!!snapshot}
                className="mt-2 block w-48 bg-surface-2 tabular-nums"
              />
            </label>
            {!snapshot ? (
              <Button onClick={onCreateDraft} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                Começar rascunho
              </Button>
            ) : (
              <>
                <span className="rounded-full bg-gold/[0.14] px-2.5 py-1 text-[11px] font-semibold text-gold-light">
                  {statusLabels[snapshot.status]} · rev {snapshot.revisionNumber}
                </span>
                <button
                  type="button"
                  onClick={onReset}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge px-3.5 py-2 text-xs font-semibold text-body hover:border-muted hover:text-snow"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Trocar mês
                </button>
                {snapshot.status === "draft" ? (
                  <button
                    type="button"
                    onClick={onDeleteDraft}
                    disabled={loading}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-negative/40 px-3.5 py-2 text-xs font-semibold text-negative-text hover:border-negative disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Excluir rascunho
                  </button>
                ) : null}
                {snapshot.status === "closed" ? (
                  <button
                    type="button"
                    onClick={onCreateRevision}
                    disabled={loading}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge px-3.5 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Criar revisão
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-6 border-t border-edge-soft pt-5">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-faint" aria-hidden />
              <h3 className="text-[13px] font-semibold text-snow">Retomar um mês existente</h3>
            </div>
            <Select value={snapshot?.id ?? ""} onChange={onSelectSnapshot} disabled={loading} className="mt-3 w-full max-w-md bg-surface-2">
              <option value="">Selecionar rascunho ou fechamento…</option>
              {snapshots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.periodMonth.slice(0, 7)} · rev {item.revisionNumber} · {statusLabels[item.status]}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="rounded-[14px] border border-edge bg-surface p-6">
          <h3 className="text-[13px] font-semibold text-snow">Contas que entram no fechamento</h3>
          <div className="mt-3 flex flex-col gap-3">
            {peopleAccounts.map(([person, names]) => (
              <div key={person} className="flex flex-wrap items-center gap-2">
                <span className="grid h-[26px] w-[26px] place-items-center rounded-full border border-edge bg-elevated text-[10px] font-semibold text-gold">
                  {initials(person)}
                </span>
                <span className="text-[13px] font-medium text-body">{person}</span>
                {names.map((name) => (
                  <span key={name} className="rounded-full border border-edge-soft bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">
                    {name}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-faint">Contas são gerenciadas em Configurações; contas inativas ficam fora dos novos fechamentos.</p>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
        <section className="rounded-[14px] border border-gold/35 bg-gradient-to-br from-gold/[0.08] to-surface/40 p-[22px]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Selic do mês</div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-3xl font-semibold tabular-nums text-snow">{percent(Number(selic.value), 2)}</span>
            {selic.loading ? <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden /> : null}
          </div>
          <p className="mt-2 text-xs leading-[18px] text-muted">{selic.status}</p>
          <p className="mt-3 text-[11px] leading-[17px] text-faint">
            A Selic desconta as faturas futuras do cartão a valor presente. Ela é buscada automaticamente no Bacen (série SGS 432) e gravada junto
            com o fechamento.
          </p>
          <button
            type="button"
            onClick={selic.refresh}
            disabled={selic.loading || loading}
            className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-edge bg-night/50 px-3 py-1.5 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:opacity-60"
          >
            {selic.loading ? <Loader2 className="h-[13px] w-[13px] animate-spin" aria-hidden /> : <RotateCcw className="h-[13px] w-[13px]" aria-hidden />}
            Atualizar pelo Bacen
          </button>
        </section>

        <button
          type="button"
          onClick={onContinue}
          disabled={!snapshot}
          className="focus-ring rounded-[10px] bg-gold py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuar para os saldos
          <ArrowRight className="ml-2 inline h-[15px] w-[15px]" aria-hidden />
        </button>
        {!snapshot ? (
          <p className="text-center text-[11px] text-faint">Comece um rascunho ou retome um mês existente para continuar.</p>
        ) : null}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone, muted }: { label: string; value: string; tone?: "positive" | "negative"; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={clsx(
          "text-right font-semibold tabular-nums",
          tone === "positive" && "text-positive-text",
          tone === "negative" && "text-negative-text",
          !tone && (muted ? "font-normal text-body" : "text-snow"),
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-[10px] border border-edge-soft bg-surface-2 p-3.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div
        className={clsx(
          "mt-1.5 text-lg font-semibold tabular-nums",
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
