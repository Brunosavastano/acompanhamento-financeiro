"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { DebtBulkPanel } from "@/components/debt-bulk-panel";
import { Input, Select } from "@/components/ui";
import { currency } from "@/lib/format";

type Person = { id: string; name: string };
type Flow = {
  id: string;
  personId: string;
  cardName: string;
  person: { name: string };
  invoiceMonth: string;
  paymentMonth: string;
  amount: string;
  description: string | null;
};
type FlowForm = {
  personId: string;
  invoiceMonth: string;
  paymentMonth: string;
  amount: string;
  description: string;
};

function shortMonth(period: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(`${period.slice(0, 7)}-01`))
    .replace(".", "");
}

function monthName(period: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${period.slice(0, 7)}-01`));
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const text = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return text.toUpperCase();
}

export function DebtManager({
  people,
  period,
  aiReaderAvailable = false,
  baseLocked = false,
}: {
  people: Person[];
  period: string;
  aiReaderAvailable?: boolean;
  baseLocked?: boolean;
}) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [summary, setSummary] = useState({ nominalTotal: 0, presentValueTotal: 0, floatGain: 0, monthlyInvoiceTotal: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FlowForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<FlowForm>({
    personId: people[0]?.id ?? "",
    invoiceMonth: `${period}-01`,
    paymentMonth: monthAfter(period),
    amount: "",
    description: "",
  });

  const timeline = useMemo(() => {
    const map = new Map<string, Flow[]>();
    for (const flow of flows) {
      const key = flow.paymentMonth.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), flow]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, items]) => ({
        month,
        items: [...items].sort(
          (a, b) => a.person.name.localeCompare(b.person.name, "pt-BR") || Number(b.amount) - Number(a.amount),
        ),
        total: items.reduce((sum, flow) => sum + Number(flow.amount), 0),
      }));
  }, [flows]);
  const maxMonthTotal = useMemo(() => Math.max(...timeline.map((group) => group.total), 0), [timeline]);
  const highlightMonth = timeline.some((group) => group.month === period) ? period : timeline[0]?.month;


  async function load() {
    try {
      const [flowResponse, summaryResponse] = await Promise.all([
        fetch(`/api/debts?period_month=${period}`),
        fetch(`/api/debts/summary?period_month=${period}`),
      ]);
      if (!flowResponse.ok || !summaryResponse.ok) {
        throw new Error("Não foi possível carregar os fluxos de dívida.");
      }
      setFlows(await flowResponse.json());
      setSummary(await summaryResponse.json());
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao carregar dívidas." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    void load();
    setForm((current) => ({
      ...current,
      invoiceMonth: `${period}-01`,
      paymentMonth: current.paymentMonth < `${period}-01` ? monthAfter(period) : current.paymentMonth,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      // Substituição é o comportamento único: o valor novo vale para o mês;
      // o anterior fica na auditoria, sem prompts nem confirmações.
      const response = await fetch("/api/debts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount), cardName: "Cartão principal" }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Não foi possível salvar o lançamento."));
      }
      setForm((current) => ({ ...current, amount: "", description: "" }));
      setFeedback({ kind: "success", text: "Lançamento salvo." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao adicionar parcela." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(flow: Flow) {
    setEditingId(flow.id);
    setEditForm({
      personId: flow.personId,
      invoiceMonth: `${flow.invoiceMonth.slice(0, 7)}-01`,
      paymentMonth: `${flow.paymentMonth.slice(0, 7)}-01`,
      amount: String(flow.amount),
      description: flow.description ?? "",
    });
    setFeedback(null);
  }

  async function saveFlow(id: string) {
    if (!editForm) return;
    setSavingId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/debt-cashflows/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          cardName: "Cartão principal",
          amount: Number(editForm.amount),
          description: editForm.description || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Não foi possível salvar a parcela."));
      }
      setEditingId(null);
      setEditForm(null);
      setFeedback({ kind: "success", text: "Lançamento atualizado." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao salvar parcela." });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteFlow(id: string) {
    setDeletingId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/debt-cashflows/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Não foi possível remover a parcela."));
      }
      setFeedback({ kind: "success", text: "Lançamento removido." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao remover parcela." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[14px] border border-edge bg-gradient-to-br from-[#101A30] to-surface p-[22px]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dívida total hoje</div>
          <div className="mt-2 text-[28px] font-semibold tabular-nums text-snow">{currency(summary.presentValueTotal)}</div>
          <div className="mt-1.5 text-xs text-muted">valor presente das faturas futuras</div>
        </div>
        <div className="rounded-[14px] border border-edge bg-surface p-[22px]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Somatório nominal</div>
          <div className="mt-2 text-[28px] font-semibold tabular-nums text-snow">{currency(summary.nominalTotal)}</div>
          <div className="mt-1.5 text-xs text-muted">tudo o que ainda vai vencer</div>
        </div>
        <div className="rounded-[14px] border border-edge bg-surface p-[22px]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Ganho de float</div>
          <div className="mt-2 text-[28px] font-semibold tabular-nums text-positive-text">{currency(summary.floatGain)}</div>
          <div className="mt-1.5 text-xs text-muted">o dinheiro rende até o vencimento</div>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-normal text-snow">Linha do tempo de vencimentos</h2>
            <span className="text-xs text-faint">
              {timeline.length > 0 ? `${timeline.length} ${timeline.length === 1 ? "mês" : "meses"} com vencimentos` : ""}
            </span>
          </div>

          {isLoading ? (
            <p className="mt-5 inline-flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Carregando lançamentos…
            </p>
          ) : timeline.length === 0 ? (
            <p className="mt-5 text-sm text-muted">
              Nenhum vencimento futuro registrado para a base de {monthName(period)}. Registre a primeira fatura ou parcela ao lado.
            </p>
          ) : (
            <div className="mt-5 flex flex-col">
              {timeline.map((group) => {
                const isCurrent = group.month === highlightMonth;
                return (
                  <div key={group.month} className="grid grid-cols-[64px_1fr] gap-4">
                    <div className="pt-0.5 text-right">
                      <div className={clsx("text-[13px] font-semibold", isCurrent ? "text-gold-light" : "text-body")}>
                        {shortMonth(group.month)}
                      </div>
                      <div className="text-[11px] text-faint">{group.month.slice(0, 4)}</div>
                    </div>
                    <div className="relative border-l-2 border-edge pb-6 pl-5 last:pb-1">
                      <span
                        className={clsx(
                          "absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface",
                          isCurrent ? "bg-gold" : "bg-steel",
                        )}
                        aria-hidden
                      />
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-base font-semibold tabular-nums text-snow">{currency(group.total)}</span>
                        <span className="text-[11px] text-faint">
                          {group.items.length} {group.items.length === 1 ? "lançamento" : "lançamentos"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 max-w-[420px] rounded-full bg-elevated">
                        <div
                          className={clsx("h-2 rounded-full", isCurrent ? "bg-gold" : "bg-info")}
                          style={{ width: `${maxMonthTotal > 0 ? Math.max((group.total / maxMonthTotal) * 100, 3) : 0}%` }}
                        />
                      </div>
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        {group.items.map((flow) =>
                          editingId === flow.id && editForm ? (
                            <div key={flow.id} className="rounded-[10px] border border-edge bg-surface-2 p-3">
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                <PersonSelect people={people} value={editForm.personId} onChange={(personId) => setEditForm({ ...editForm, personId })} />
                                <Input
                                  type="month"
                                  aria-label="Mês de vencimento"
                                  value={editForm.paymentMonth.slice(0, 7)}
                                  onChange={(event) => setEditForm({ ...editForm, paymentMonth: `${event.target.value}-01` })}
                                  className="w-full bg-surface tabular-nums"
                                />
                                <Input
                                  type="number"
                                  step="0.01"
                                  aria-label="Valor"
                                  value={editForm.amount}
                                  onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })}
                                  className="w-full bg-surface text-right tabular-nums"
                                />
                                <Input
                                  aria-label="Descrição"
                                  placeholder="Descrição"
                                  value={editForm.description}
                                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                                  className="w-full bg-surface"
                                />
                              </div>
                              <div className="mt-2.5 flex justify-end gap-2">
                                <IconButton label="Salvar lançamento" disabled={savingId === flow.id || !editForm.amount} onClick={() => void saveFlow(flow.id)}>
                                  {savingId === flow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                </IconButton>
                                <IconButton label="Cancelar edição" onClick={() => { setEditingId(null); setEditForm(null); }}>
                                  <X className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            </div>
                          ) : (
                            <div key={flow.id} className="group flex items-center gap-2.5 text-xs">
                              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-edge bg-elevated text-[8px] font-semibold text-gold">
                                {initials(flow.person.name)}
                              </span>
                              <span className="truncate text-body">{flow.description || `Fatura ${flow.cardName}`}</span>
                              <span className="ml-auto whitespace-nowrap font-medium tabular-nums text-snow">{currency(Number(flow.amount))}</span>
                              <IconButton label={`Editar lançamento de ${flow.person.name}`} disabled={baseLocked} onClick={() => startEdit(flow)}>
                                <Pencil className="h-[13px] w-[13px]" />
                              </IconButton>
                              <IconButton
                                label={`Remover lançamento de ${flow.person.name}`}
                                danger
                                disabled={baseLocked || deletingId === flow.id}
                                onClick={() => void deleteFlow(flow.id)}
                              >
                                {deletingId === flow.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Trash2 className="h-[13px] w-[13px]" />}
                              </IconButton>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-normal text-snow">Registrar fatura ou parcela</h2>
          {baseLocked ? (
            <p className="mt-3 rounded-[10px] border border-gold/35 bg-gold/[0.06] px-3.5 py-3 text-xs leading-[18px] text-gold-light">
              A base de {monthName(period)} pertence a um mês <strong className="font-semibold">fechado</strong> e é somente leitura — alterar
              aqui reescreveria o histórico. Use as setas acima para ir à base do mês em aberto, ou crie uma revisão do fechamento para
              ajustar este mês.
            </p>
          ) : (
            <p className="mt-2 text-xs leading-[18px] text-muted">
              Informe o total que vai vencer no cartão em um mês futuro. O app desconta para valor presente usando a Selic.
            </p>
          )}
          {!baseLocked ? (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted">
                Pessoa
                <PersonSelect people={people} value={form.personId} onChange={(personId) => setForm({ ...form, personId })} className="mt-1.5" />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Vencimento
                <Input
                  type="month"
                  value={form.paymentMonth.slice(0, 7)}
                  onChange={(event) => setForm({ ...form, paymentMonth: `${event.target.value}-01` })}
                  className="mt-1.5 block w-full bg-surface-2 tabular-nums"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-muted">
              Valor
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                className="mt-1.5 block w-full bg-surface-2 text-right text-[15px] font-semibold tabular-nums"
              />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Descrição <span className="font-normal text-faint">(opcional)</span>
              <Input
                placeholder="Ex.: fatura Nubank novembro"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-1.5 block w-full bg-surface-2"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting || !form.personId || !form.amount}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] bg-gold py-3 text-[13px] font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden /> : <Plus className="h-[15px] w-[15px]" aria-hidden />}
              Adicionar
            </button>
            {feedback ? <Feedback kind={feedback.kind} text={feedback.text} /> : null}
          </form>
          ) : null}

          {!baseLocked ? (
            <DebtBulkPanel people={people} period={period} aiReaderAvailable={aiReaderAvailable} onSaved={load} />
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-edge-soft pt-3.5 text-xs text-faint">
            <span>Fatura de {monthName(period)}</span>
            <span className="font-semibold tabular-nums text-body">{currency(summary.monthlyInvoiceTotal)}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function PersonSelect({
  people,
  value,
  onChange,
  className,
}: {
  people: Person[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} className={clsx("w-full min-w-32 bg-surface-2", className)}>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </Select>
  );
}

function IconButton({ children, danger, disabled, label, onClick }: { children: React.ReactNode; danger?: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={clsx(
        "focus-ring inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-faint disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "hover:bg-elevated hover:text-negative-text" : "hover:bg-elevated hover:text-gold-light",
      )}
    >
      {children}
    </button>
  );
}

function Feedback({ kind, text }: { kind: "success" | "error"; text: string }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={clsx("flex items-center gap-2 text-[13px]", kind === "success" ? "text-positive-text" : "text-negative-text")}>
      <Icon className="h-4 w-4" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

async function apiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

function monthAfter(period: string) {
  const [year, month] = period.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
