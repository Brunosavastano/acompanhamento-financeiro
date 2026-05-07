"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button, Input, Panel, Select } from "@/components/ui";
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

const kindLabels: Record<BudgetKind, string> = {
  income: "Entrada",
  fixed_expense: "Despesa fixa",
  variable_expense: "Despesa variável",
};

const recurrenceLabels: Record<BudgetRecurrence, string> = {
  monthly: "Mensal",
  annualized: "Anualizado",
  one_off: "Pontual",
};

export function BudgetManager({ people, defaultPeriod }: { people: Person[]; defaultPeriod?: string }) {
  const currentPeriod = defaultPeriod ?? new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(currentPeriod);
  const [items, setItems] = useState<Item[]>([]);
  const [metrics, setMetrics] = useState<BudgetMetrics>({
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
  });
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BudgetForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetForm>({
    personId: "",
    name: "",
    kind: "income",
    amountMonthly: "",
    recurrence: "monthly",
    startMonth: `${currentPeriod}-01`,
    endMonth: "",
    isActive: true,
  });

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
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

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
      setForm({ ...form, name: "", amountMonthly: "", endMonth: "" });
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

  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <Panel>
        <h2 className="text-base font-semibold text-white">Novo item</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Input placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full" />
          <KindSelect value={form.kind} onChange={(kind) => setForm({ ...form, kind })} />
          <PersonSelect people={people} value={form.personId} onChange={(personId) => setForm({ ...form, personId })} />
          <RecurrenceSelect value={form.recurrence} onChange={(recurrence) => setForm({ ...form, recurrence, endMonth: recurrence === "one_off" ? "" : form.endMonth })} />
          <Input type="number" step="0.01" placeholder="Valor mensal" value={form.amountMonthly} onChange={(event) => setForm({ ...form, amountMonthly: event.target.value })} className="w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Início
              <Input type="month" value={form.startMonth.slice(0, 7)} onChange={(event) => setForm({ ...form, startMonth: `${event.target.value}-01` })} className="mt-2 w-full" />
            </label>
            <label className="text-sm text-slate-300">
              Fim
              <Input
                type="month"
                value={form.endMonth ? form.endMonth.slice(0, 7) : ""}
                onChange={(event) => setForm({ ...form, endMonth: event.target.value ? `${event.target.value}-01` : "" })}
                className="mt-2 w-full"
                disabled={form.recurrence === "one_off"}
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            Ativo no orçamento
          </label>
          <Button type="submit" disabled={isSubmitting || !form.name || !form.amountMonthly}>
            <Plus className="h-4 w-4" />
            {isSubmitting ? "Adicionando" : "Adicionar"}
          </Button>
          {feedback ? <Feedback kind={feedback.kind} text={feedback.text} /> : null}
        </form>
      </Panel>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Orçamento de {period}</h2>
            <p className="text-sm text-slate-400">
              Receita {currency(metrics.incomeTotal)} - Despesa projetada {currency(metrics.expenseTotal)} - Sobra {currency(metrics.monthlySurplus)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <button type="button" onClick={() => void load()} className="focus-ring rounded-md border border-line p-2 text-slate-300" aria-label="Atualizar orçamento">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Comprometimento" value={percent(metrics.incomeCommitment, 1)} />
          <Metric label="Poupança orçamentária" value={percent(metrics.budgetSavingsRate, 1)} />
          <Metric
            label="Cartão média"
            value={currency(metrics.cardMovingAverageExpense)}
            detail={
              metrics.cardMovingAverageApplied || metrics.cardMovingAverageExpense === 0
                ? `${metrics.cardMovingAverageMonths} mês(es)`
                : `${metrics.cardMovingAverageMonths} mês(es), já coberto`
            }
          />
          <Metric label="Sobra mensal" value={currency(metrics.monthlySurplus)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Metric label="Despesa fixa" value={currency(metrics.fixedExpenseTotal)} />
          <Metric label="Variável manual" value={currency(metrics.budgetItemVariableExpenseTotal)} />
          <Metric label="Variável projetada" value={currency(metrics.variableExpenseTotal)} />
        </div>
        <div className="mt-4 space-y-3 md:hidden">
          {items.map((item) => {
            const isEditing = editingId === item.id && editForm;
            return (
              <div key={item.id} className={item.isActive ? "rounded-md border border-line bg-ink p-3" : "rounded-md border border-line bg-ink p-3 opacity-60"}>
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="w-full" />
                    <div className="grid grid-cols-2 gap-2">
                      <KindSelect value={editForm.kind} onChange={(kind) => setEditForm({ ...editForm, kind })} />
                      <PersonSelect people={people} value={editForm.personId} onChange={(personId) => setEditForm({ ...editForm, personId })} />
                    </div>
                    <RecurrenceSelect value={editForm.recurrence} onChange={(recurrence) => setEditForm({ ...editForm, recurrence, endMonth: recurrence === "one_off" ? "" : editForm.endMonth })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="month" value={editForm.startMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, startMonth: `${event.target.value}-01` })} className="w-full" />
                      <Input
                        type="month"
                        value={editForm.endMonth ? editForm.endMonth.slice(0, 7) : ""}
                        onChange={(event) => setEditForm({ ...editForm, endMonth: event.target.value ? `${event.target.value}-01` : "" })}
                        className="w-full"
                        disabled={editForm.recurrence === "one_off"}
                      />
                    </div>
                    <Input type="number" step="0.01" value={editForm.amountMonthly} onChange={(event) => setEditForm({ ...editForm, amountMonthly: event.target.value })} className="w-full" />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} />
                      Ativo
                    </label>
                    <div className="flex justify-end gap-2">
                      <IconButton label="Salvar item no card" disabled={savingId === item.id || !editForm.name || !editForm.amountMonthly} onClick={() => void saveItem(item.id)}>
                        <Save className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Cancelar edição do item no card" onClick={() => { setEditingId(null); setEditForm(null); }}>
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{kindLabels[item.kind]} - {item.person?.name ?? "Familiar"} - {recurrenceLabels[item.recurrence]}</div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-white">{currency(Number(item.amountMonthly))}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{item.startMonth.slice(0, 7)} &gt; {item.endMonth ? item.endMonth.slice(0, 7) : "-"}</span>
                      <span>{item.isActive ? "Ativo" : "Inativo"}</span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <IconButton label="Editar item no card" onClick={() => startEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Remover item no card" disabled={deletingId === item.id} danger onClick={() => void deleteItem(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2">Item</th>
                <th>Tipo</th>
                <th>Pessoa</th>
                <th>Recorrência</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Valor</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => {
                const isEditing = editingId === item.id && editForm;
                return (
                  <tr key={item.id} className={item.isActive ? undefined : "opacity-60"}>
                    <td className="py-2 text-white">
                      {isEditing ? <Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="w-48" /> : item.name}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? <KindSelect value={editForm.kind} onChange={(kind) => setEditForm({ ...editForm, kind })} className="w-40" /> : kindLabels[item.kind]}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? <PersonSelect people={people} value={editForm.personId} onChange={(personId) => setEditForm({ ...editForm, personId })} className="w-40" /> : (item.person?.name ?? "Familiar")}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? <RecurrenceSelect value={editForm.recurrence} onChange={(recurrence) => setEditForm({ ...editForm, recurrence, endMonth: recurrence === "one_off" ? "" : editForm.endMonth })} className="w-36" /> : recurrenceLabels[item.recurrence]}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? <Input type="month" value={editForm.startMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, startMonth: `${event.target.value}-01` })} className="w-36" /> : item.startMonth.slice(0, 7)}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? (
                        <Input
                          type="month"
                          value={editForm.endMonth ? editForm.endMonth.slice(0, 7) : ""}
                          onChange={(event) => setEditForm({ ...editForm, endMonth: event.target.value ? `${event.target.value}-01` : "" })}
                          className="w-36"
                          disabled={editForm.recurrence === "one_off"}
                        />
                      ) : item.endMonth ? item.endMonth.slice(0, 7) : "-"}
                    </td>
                    <td className="font-medium text-white">
                      {isEditing ? <Input type="number" step="0.01" value={editForm.amountMonthly} onChange={(event) => setEditForm({ ...editForm, amountMonthly: event.target.value })} className="w-32" /> : currency(Number(item.amountMonthly))}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? (
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                          <input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} />
                          Ativo
                        </label>
                      ) : item.isActive ? "Ativo" : "Inativo"}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <IconButton label="Salvar item" disabled={savingId === item.id || !editForm.name || !editForm.amountMonthly} onClick={() => void saveItem(item.id)}>
                            <Save className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Cancelar edição" onClick={() => { setEditingId(null); setEditForm(null); }}>
                            <X className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <IconButton label="Editar item" onClick={() => startEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Remover item" disabled={deletingId === item.id} danger onClick={() => void deleteItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhum item ativo neste mês.</p> : null}
      </Panel>
    </div>
  );
}

function KindSelect({ className, value, onChange }: { className?: string; value: BudgetKind; onChange: (value: BudgetKind) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as BudgetKind)} className={className ?? "w-full"}>
      <option value="income">Entrada</option>
      <option value="fixed_expense">Despesa fixa</option>
      <option value="variable_expense">Despesa variável</option>
    </Select>
  );
}

function RecurrenceSelect({ className, value, onChange }: { className?: string; value: BudgetRecurrence; onChange: (value: BudgetRecurrence) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as BudgetRecurrence)} className={className ?? "w-full"}>
      <option value="monthly">Mensal</option>
      <option value="annualized">Anualizado</option>
      <option value="one_off">Pontual</option>
    </Select>
  );
}

function PersonSelect({ className, people, value, onChange }: { className?: string; people: Person[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} className={className ?? "w-full"}>
      <option value="">Familiar</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </Select>
  );
}

function Metric({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function IconButton({ children, danger, disabled, label, onClick }: { children: React.ReactNode; danger?: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={
        danger
          ? "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-400 hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          : "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-400 hover:border-cyan hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function Feedback({ kind, text }: { kind: "success" | "error"; text: string }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={kind === "success" ? "flex items-center gap-2 text-sm text-green" : "flex items-center gap-2 text-sm text-red-300"}>
      <Icon className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}
