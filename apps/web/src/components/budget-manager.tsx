"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { Input, Select } from "@/components/ui";
import { currency, percent } from "@/lib/format";

type Person = { id: string; name: string };
type BudgetKind = "income" | "fixed_expense" | "variable_expense";
type BudgetRecurrence = "monthly" | "annualized" | "one_off";
type Item = {
  id: string;
  personId: string | null;
  name: string;
  kind: BudgetKind;
  amountMonthly: string;
  recurrence: BudgetRecurrence;
  startMonth: string;
  endMonth: string | null;
  person: { name: string } | null;
  isActive: boolean;
};
type BudgetForm = {
  personId: string;
  name: string;
  kind: BudgetKind;
  amountMonthly: string;
  recurrence: BudgetRecurrence;
  startMonth: string;
  endMonth: string;
  isActive: boolean;
};
type BudgetMetrics = {
  incomeTotal: number;
  fixedExpenseTotal: number;
  budgetItemVariableExpenseTotal: number;
  cardMovingAverageExpense: number;
  cardMovingAverageAppliedExpense: number;
  cardMovingAverageApplied: boolean;
  cardMovingAverageMonths: number;
  variableExpenseTotal: number;
  expenseTotal: number;
  monthlySurplus: number;
  incomeCommitment: number;
  budgetSavingsRate: number;
};

const emptyMetrics: BudgetMetrics = {
  incomeTotal: 0,
  fixedExpenseTotal: 0,
  budgetItemVariableExpenseTotal: 0,
  cardMovingAverageExpense: 0,
  cardMovingAverageAppliedExpense: 0,
  cardMovingAverageApplied: false,
  cardMovingAverageMonths: 0,
  variableExpenseTotal: 0,
  expenseTotal: 0,
  monthlySurplus: 0,
  incomeCommitment: 0,
  budgetSavingsRate: 0,
};

const recurrenceLabels: Record<BudgetRecurrence, string> = {
  monthly: "mensal",
  annualized: "anualizado",
  one_off: "pontual",
};

function shortMonthYear(period: string) {
  const date = new Date(`${period.slice(0, 7)}-01`);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${month}/${String(date.getUTCFullYear()).slice(2)}`;
}

function emptyForm(kind: BudgetKind, period: string): BudgetForm {
  return {
    personId: "",
    name: "",
    kind,
    amountMonthly: "",
    recurrence: "monthly",
    startMonth: `${period}-01`,
    endMonth: "",
    isActive: true,
  };
}

export function BudgetManager({ people, period }: { people: Person[]; period: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [metrics, setMetrics] = useState<BudgetMetrics>(emptyMetrics);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addingKind, setAddingKind] = useState<BudgetKind | null>(null);
  const [form, setForm] = useState<BudgetForm>(emptyForm("income", period));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BudgetForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch(`/api/budget?period_month=${period}`);
      if (!response.ok) {
        throw new Error("Não foi possível carregar o orçamento.");
      }
      const data = await response.json();
      setItems(data.items);
      setMetrics(data.metrics);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao carregar orçamento." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function openAdd(kind: BudgetKind) {
    setAddingKind(kind);
    setForm(emptyForm(kind, period));
    setEditingId(null);
    setEditForm(null);
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          personId: form.personId || null,
          amountMonthly: Number(form.amountMonthly),
          endMonth: form.recurrence === "one_off" ? null : form.endMonth || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Não foi possível adicionar o item.");
      }
      setAddingKind(null);
      setFeedback({ kind: "success", text: "Item adicionado." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao adicionar item." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setAddingKind(null);
    setEditForm({
      personId: item.personId ?? "",
      name: item.name,
      kind: item.kind,
      amountMonthly: String(item.amountMonthly),
      recurrence: item.recurrence,
      startMonth: item.startMonth,
      endMonth: item.endMonth ?? "",
      isActive: item.isActive,
    });
    setFeedback(null);
  }

  async function saveItem(id: string) {
    if (!editForm) return;
    setSavingId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/budget-items/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          personId: editForm.personId || null,
          amountMonthly: Number(editForm.amountMonthly),
          endMonth: editForm.recurrence === "one_off" ? null : editForm.endMonth || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Não foi possível salvar o item.");
      }
      setEditingId(null);
      setEditForm(null);
      setFeedback({ kind: "success", text: "Item atualizado." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao salvar item." });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(id: string) {
    setDeletingId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/budget-items/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Não foi possível remover o item.");
      }
      setFeedback({ kind: "success", text: "Item removido." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao remover item." });
    } finally {
      setDeletingId(null);
    }
  }

  const income = metrics.incomeTotal;
  // A barra é normalizada pelo maior entre renda e despesa, para não estourar 100% quando a sobra é negativa.
  const barBase = Math.max(income, metrics.expenseTotal, 1);
  const surplusPositive = Math.max(metrics.monthlySurplus, 0);
  const segments = [
    { label: "Fixas", value: metrics.fixedExpenseTotal, className: "bg-steel text-body" },
    { label: "Variáveis + cartão", value: metrics.variableExpenseTotal, className: "bg-info text-sidebar" },
    { label: "Sobra", value: surplusPositive, className: "bg-positive text-sidebar" },
  ].map((segment) => ({
    ...segment,
    widthPct: (segment.value / barBase) * 100,
    incomePct: income > 0 ? segment.value / income : 0,
  }));

  // O item automático do cartão só aparece quando a média entra de fato no total;
  // quando itens manuais já a cobrem, a nota do card de cima explica a situação.
  const cardValue = metrics.cardMovingAverageAppliedExpense;
  const showCardItem = metrics.cardMovingAverageApplied && cardValue > 0;

  const columns: { kind: BudgetKind; title: string; dot: string; addLabel: string; subtotal: number }[] = [
    { kind: "income", title: "Entradas", dot: "bg-positive", addLabel: "Adicionar entrada", subtotal: metrics.incomeTotal },
    { kind: "fixed_expense", title: "Despesas fixas", dot: "bg-steel", addLabel: "Adicionar fixa", subtotal: metrics.fixedExpenseTotal },
    { kind: "variable_expense", title: "Variáveis", dot: "bg-info", addLabel: "Adicionar variável", subtotal: metrics.variableExpenseTotal },
  ];

  return (
    <div>
      <section className="rounded-[14px] border border-edge bg-gradient-to-br from-[#101A30] to-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-lg font-normal text-snow">Para onde vai a renda</h2>
          <span className="text-xs text-muted">
            Renda total <strong className="font-semibold tabular-nums text-snow">{currency(income)}</strong> · comprometimento{" "}
            <strong className="font-semibold tabular-nums text-gold-light">{percent(metrics.incomeCommitment, 1)}</strong>
          </span>
        </div>
        {income > 0 ? (
          <>
            <div className="mt-4 flex h-[34px] overflow-hidden rounded-[10px]">
              {segments.map((segment) =>
                segment.widthPct > 0 ? (
                  <span
                    key={segment.label}
                    style={{ width: `${segment.widthPct}%` }}
                    title={`${segment.label} ${percent(segment.incomePct, 1)}`}
                    className={clsx("flex items-center justify-center text-[11px] font-semibold", segment.className)}
                  >
                    {segment.widthPct >= 14 ? `${segment.label} ${percent(segment.incomePct, 1)}` : ""}
                  </span>
                ) : null,
              )}
            </div>
            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs text-muted">
              <span>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-[3px] bg-steel" aria-hidden />
                Despesas fixas <strong className="font-semibold tabular-nums text-snow">{currency(metrics.fixedExpenseTotal)}</strong>
              </span>
              <span>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-[3px] bg-info" aria-hidden />
                Variáveis + cartão <strong className="font-semibold tabular-nums text-snow">{currency(metrics.variableExpenseTotal)}</strong>
              </span>
              <span>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-[3px] bg-positive" aria-hidden />
                Sobra planejada{" "}
                <strong className={clsx("font-semibold tabular-nums", metrics.monthlySurplus >= 0 ? "text-positive-text" : "text-negative-text")}>
                  {currency(metrics.monthlySurplus)}
                </strong>
              </span>
              {metrics.cardMovingAverageMonths > 0 ? (
                <span className="ml-auto">
                  Cartão entra pela média móvel de {metrics.cardMovingAverageMonths} {metrics.cardMovingAverageMonths === 1 ? "mês" : "meses"}:{" "}
                  <strong className="font-semibold tabular-nums text-snow">{currency(metrics.cardMovingAverageExpense)}</strong>
                  {!metrics.cardMovingAverageApplied ? " (já coberta pelos itens manuais)" : ""}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">Cadastre as entradas da família para ver a distribuição da renda.</p>
        )}
      </section>

      {feedback ? <Feedback kind={feedback.kind} text={feedback.text} className="mt-4" /> : null}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnItems = items.filter((item) => item.kind === column.kind);
          return (
            <section key={column.kind} className="min-w-0 overflow-hidden rounded-[14px] border border-edge bg-surface">
              <div className="flex items-center gap-2.5 border-b border-edge-soft bg-surface-2 px-4 py-3.5">
                <span className={clsx("h-[9px] w-[9px] shrink-0 rounded-[3px]", column.dot)} aria-hidden />
                <span className="text-[13px] font-semibold text-snow">{column.title}</span>
                <span className="ml-auto text-[13px] font-semibold tabular-nums text-snow">{currency(column.subtotal)}</span>
              </div>
              <div className="px-4 pb-4 pt-1.5">
                {isLoading ? (
                  <p className="inline-flex items-center gap-2 py-3 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Carregando…
                  </p>
                ) : (
                  <>
                    {column.kind === "variable_expense" && showCardItem ? (
                      <div className="flex items-center gap-2.5 border-b border-edge-hair py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-body">
                            Cartão (média {metrics.cardMovingAverageMonths} {metrics.cardMovingAverageMonths === 1 ? "mês" : "meses"})
                          </div>
                          <div className="text-[11px] text-faint">Automático · média móvel</div>
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums text-snow">{currency(cardValue)}</span>
                        <span className="w-[26px]" aria-hidden />
                      </div>
                    ) : null}
                    {columnItems.map((item) =>
                      editingId === item.id && editForm ? (
                        <ItemForm
                          key={item.id}
                          form={editForm}
                          setForm={(next) => setEditForm(next)}
                          people={people}
                          showActive
                          busy={savingId === item.id}
                          submitLabel="Salvar"
                          onSubmit={() => void saveItem(item.id)}
                          onCancel={() => {
                            setEditingId(null);
                            setEditForm(null);
                          }}
                        />
                      ) : (
                        <div key={item.id} className={clsx("flex items-center gap-2.5 border-b border-edge-hair py-2.5", !item.isActive && "opacity-50")}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] text-body">{item.name}</div>
                            <div className="text-[11px] text-faint">
                              {item.person?.name ?? "Familiar"} · {recurrenceLabels[item.recurrence]}
                              {item.endMonth ? ` · até ${shortMonthYear(item.endMonth)}` : ""}
                              {!item.isActive ? " · inativo" : ""}
                            </div>
                          </div>
                          <span className="text-[13px] font-semibold tabular-nums text-snow">{currency(Number(item.amountMonthly))}</span>
                          <div className="flex shrink-0">
                            <IconButton label={`Editar ${item.name}`} onClick={() => startEdit(item)}>
                              <Pencil className="h-[13px] w-[13px]" />
                            </IconButton>
                            <IconButton label={`Remover ${item.name}`} danger disabled={deletingId === item.id} onClick={() => void deleteItem(item.id)}>
                              {deletingId === item.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Trash2 className="h-[13px] w-[13px]" />}
                            </IconButton>
                          </div>
                        </div>
                      ),
                    )}
                    {columnItems.length === 0 && !(column.kind === "variable_expense" && showCardItem) ? (
                      <p className="py-3 text-xs text-faint">Nenhum item nesta categoria.</p>
                    ) : null}
                    {addingKind === column.kind ? (
                      <ItemForm
                        form={form}
                        setForm={(next) => setForm(next)}
                        people={people}
                        busy={isSubmitting}
                        submitLabel="Adicionar"
                        onSubmit={submit}
                        onCancel={() => setAddingKind(null)}
                        className="mt-3"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAdd(column.kind)}
                        className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-edge px-3 py-1.5 text-xs font-medium text-muted hover:border-gold hover:text-gold-light"
                      >
                        <Plus className="h-[13px] w-[13px]" aria-hidden />
                        {column.addLabel}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ItemForm({
  form,
  setForm,
  people,
  busy,
  showActive,
  submitLabel,
  onSubmit,
  onCancel,
  className,
}: {
  form: BudgetForm;
  setForm: (form: BudgetForm) => void;
  people: Person[];
  busy: boolean;
  showActive?: boolean;
  submitLabel: string;
  onSubmit: ((event: FormEvent<HTMLFormElement>) => void) | (() => void);
  onCancel: () => void;
  className?: string;
}) {
  const canSubmit = !busy && form.name.trim() !== "" && form.amountMonthly !== "";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        void (onSubmit as (event: FormEvent<HTMLFormElement>) => void)(event);
      }}
      className={clsx("rounded-[10px] border border-edge bg-surface-2 p-3", className)}
    >
      <div className="flex flex-col gap-2.5">
        <Input
          placeholder="Nome do item"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          className="w-full bg-surface"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Select value={form.personId} onChange={(event) => setForm({ ...form, personId: event.target.value })} className="w-full bg-surface" aria-label="Pessoa">
            <option value="">Familiar</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <Select
            value={form.recurrence}
            onChange={(event) =>
              setForm({
                ...form,
                recurrence: event.target.value as BudgetRecurrence,
                endMonth: event.target.value === "one_off" ? "" : form.endMonth,
              })
            }
            className="w-full bg-surface"
            aria-label="Recorrência"
          >
            <option value="monthly">Mensal</option>
            <option value="annualized">Anualizado</option>
            <option value="one_off">Pontual</option>
          </Select>
        </div>
        <Input
          type="number"
          step="0.01"
          placeholder="Valor mensal"
          value={form.amountMonthly}
          onChange={(event) => setForm({ ...form, amountMonthly: event.target.value })}
          className="w-full bg-surface text-right tabular-nums"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <label className="text-[11px] font-semibold text-faint">
            Início
            <Input
              type="month"
              value={form.startMonth.slice(0, 7)}
              onChange={(event) => setForm({ ...form, startMonth: `${event.target.value}-01` })}
              className="mt-1 block w-full bg-surface tabular-nums"
            />
          </label>
          <label className="text-[11px] font-semibold text-faint">
            Fim
            <Input
              type="month"
              value={form.endMonth ? form.endMonth.slice(0, 7) : ""}
              onChange={(event) => setForm({ ...form, endMonth: event.target.value ? `${event.target.value}-01` : "" })}
              className="mt-1 block w-full bg-surface tabular-nums"
              disabled={form.recurrence === "one_off"}
            />
          </label>
        </div>
        {showActive ? (
          <label className="inline-flex items-center gap-2 text-xs text-body">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="accent-[#C9A96E]"
            />
            Ativo no orçamento
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-edge px-3.5 py-2 text-xs font-semibold text-body hover:border-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancelar
          </button>
        </div>
      </div>
    </form>
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

function Feedback({ kind, text, className }: { kind: "success" | "error"; text: string; className?: string }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={clsx("flex items-center gap-2 text-[13px]", kind === "success" ? "text-positive-text" : "text-negative-text", className)}>
      <Icon className="h-4 w-4" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
