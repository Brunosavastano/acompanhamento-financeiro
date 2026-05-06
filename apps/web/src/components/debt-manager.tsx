"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button, Input, Panel, Select } from "@/components/ui";
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

export function DebtManager({ people, defaultPeriod }: { people: Person[]; defaultPeriod: string }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [summary, setSummary] = useState({ nominalTotal: 0, presentValueTotal: 0, floatGain: 0, monthlyInvoiceTotal: 0 });
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FlowForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<FlowForm>({
    personId: people[0]?.id ?? "",
    invoiceMonth: `${defaultPeriod}-01`,
    paymentMonth: `${defaultPeriod}-01`,
    amount: "",
    description: "",
  });

  async function load() {
    try {
      const [flowResponse, summaryResponse] = await Promise.all([
        fetch(`/api/debts?period_month=${period}`),
        fetch(`/api/debts/summary?period_month=${period}`),
      ]);
      if (!flowResponse.ok || !summaryResponse.ok) {
        throw new Error("Nao foi possivel carregar os fluxos de divida.");
      }
      setFlows(await flowResponse.json());
      setSummary(await summaryResponse.json());
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao carregar dividas." });
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
      const response = await fetch("/api/debts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount), cardName: "Cartao principal" }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Nao foi possivel adicionar a parcela."));
      }
      setForm((current) => ({ ...current, amount: "", description: "" }));
      setFeedback({ kind: "success", text: "Parcela adicionada." });
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
          cardName: "Cartao principal",
          amount: Number(editForm.amount),
          description: editForm.description || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Nao foi possivel salvar a parcela."));
      }
      setEditingId(null);
      setEditForm(null);
      setFeedback({ kind: "success", text: "Parcela atualizada." });
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
        throw new Error(await apiErrorMessage(response, "Nao foi possivel remover a parcela."));
      }
      setFeedback({ kind: "success", text: "Parcela removida." });
      await load();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao remover parcela." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <Panel>
        <h2 className="text-base font-semibold text-white">Nova parcela</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Pessoa">
            <PersonSelect people={people} value={form.personId} onChange={(personId) => setForm({ ...form, personId })} />
          </Field>
          <Field label="Mes da fatura" description="Competencia usada no PV.">
            <Input type="month" value={form.invoiceMonth.slice(0, 7)} onChange={(event) => setForm({ ...form, invoiceMonth: `${event.target.value}-01` })} className="w-full" />
          </Field>
          <Field label="Mes de pagamento" description="Vencimento usado na fatura do mes.">
            <Input type="month" value={form.paymentMonth.slice(0, 7)} onChange={(event) => setForm({ ...form, paymentMonth: `${event.target.value}-01` })} className="w-full" />
          </Field>
          <Field label="Valor">
            <Input placeholder="Valor" type="number" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="w-full" />
          </Field>
          <Field label="Descricao">
            <Input placeholder="Descricao" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full" />
          </Field>
          <Button type="submit" disabled={isSubmitting || !form.personId || !form.amount}>
            <Plus className="h-4 w-4" />
            {isSubmitting ? "Adicionando" : "Adicionar"}
          </Button>
          {feedback ? <Feedback kind={feedback.kind} text={feedback.text} /> : null}
        </form>
      </Panel>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Fatura {period}</h2>
            <p className="text-sm text-slate-400">
              Nominal {currency(summary.nominalTotal)} - PV {currency(summary.presentValueTotal)} - Fatura do mes {currency(summary.monthlyInvoiceTotal)} - Float {currency(summary.floatGain)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-400">
              Mes da fatura
              <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <button type="button" onClick={() => void load()} className="focus-ring rounded-md border border-line p-2 text-slate-300" aria-label="Atualizar dividas">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          {flows.map((flow) => {
            const isEditing = editingId === flow.id && editForm;
            return (
              <div key={flow.id} className="rounded-md border border-line bg-ink p-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <Field label="Pessoa">
                      <PersonSelect people={people} value={editForm.personId} onChange={(personId) => setEditForm({ ...editForm, personId })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Fatura">
                        <Input type="month" value={editForm.invoiceMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, invoiceMonth: `${event.target.value}-01` })} className="w-full" />
                      </Field>
                      <Field label="Pagamento">
                        <Input type="month" value={editForm.paymentMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, paymentMonth: `${event.target.value}-01` })} className="w-full" />
                      </Field>
                    </div>
                    <Field label="Valor">
                      <Input type="number" step="0.01" value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} className="w-full" />
                    </Field>
                    <Field label="Descricao">
                      <Input value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className="w-full" />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <IconButton label="Salvar fluxo no card" disabled={savingId === flow.id || !editForm.amount} onClick={() => void saveFlow(flow.id)}>
                        <Save className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Cancelar edicao do fluxo no card" onClick={() => { setEditingId(null); setEditForm(null); }}>
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{flow.person.name}</div>
                        <div className="mt-1 text-xs text-slate-500">Fatura {flow.invoiceMonth.slice(0, 7)} - pagamento {flow.paymentMonth.slice(0, 7)}</div>
                      </div>
                      <div className="text-right text-sm font-semibold text-white">{currency(Number(flow.amount))}</div>
                    </div>
                    <div className="mt-3 text-sm text-slate-400">{flow.description ?? "-"}</div>
                    <div className="mt-3 flex justify-end gap-2">
                      <IconButton label="Editar fluxo no card" onClick={() => startEdit(flow)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Remover fluxo no card" disabled={deletingId === flow.id} danger onClick={() => void deleteFlow(flow.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2">Pessoa</th>
                <th>Mes da fatura</th>
                <th>Mes de pagamento</th>
                <th>Valor</th>
                <th>Descricao</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {flows.map((flow) => {
                const isEditing = editingId === flow.id && editForm;
                return (
                  <tr key={flow.id}>
                    <td className="py-2 text-slate-300">
                      {isEditing ? <PersonSelect people={people} value={editForm.personId} onChange={(personId) => setEditForm({ ...editForm, personId })} /> : flow.person.name}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? (
                        <Input type="month" value={editForm.invoiceMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, invoiceMonth: `${event.target.value}-01` })} className="w-36" />
                      ) : (
                        flow.invoiceMonth.slice(0, 7)
                      )}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? (
                        <Input type="month" value={editForm.paymentMonth.slice(0, 7)} onChange={(event) => setEditForm({ ...editForm, paymentMonth: `${event.target.value}-01` })} className="w-36" />
                      ) : (
                        flow.paymentMonth.slice(0, 7)
                      )}
                    </td>
                    <td className="font-medium text-white">
                      {isEditing ? <Input type="number" step="0.01" value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} className="w-32" /> : currency(Number(flow.amount))}
                    </td>
                    <td className="text-slate-400">
                      {isEditing ? <Input value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className="w-52" /> : (flow.description ?? "-")}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <IconButton label="Salvar parcela" disabled={savingId === flow.id || !editForm.amount} onClick={() => void saveFlow(flow.id)}>
                            <Save className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Cancelar edicao" onClick={() => { setEditingId(null); setEditForm(null); }}>
                            <X className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <IconButton label="Editar parcela" onClick={() => startEdit(flow)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Remover parcela" disabled={deletingId === flow.id} danger onClick={() => void deleteFlow(flow.id)}>
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
        {flows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma parcela para este mes.</p> : null}
      </Panel>
    </div>
  );
}

function PersonSelect({ people, value, onChange }: { people: Person[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-32">
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

async function apiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

function Field({ children, description, label }: { children: React.ReactNode; description?: string; label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {description ? <span className="ml-2 text-xs text-slate-500">{description}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}
