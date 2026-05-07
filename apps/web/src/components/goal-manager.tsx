"use client";

import { useState } from "react";
import { Flag, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { percent } from "@/lib/format";
import { Button, Input, Panel, Select } from "@/components/ui";

type Goal = {
  id: string;
  title: string;
  horizon: string;
  metricKey: string;
  targetValue: string | null;
  targetDate: string | null;
  comparisonOperator: "greater_or_equal" | "less_or_equal" | "equals" | "manual";
  riskCapValue: string | null;
  notes: string | null;
  progressPct: number;
  status: string;
  currentValue: string | null;
  progressSource: "manual" | "calculated" | "empty";
  requiredCagr: number | null;
};

type GoalForm = {
  title: string;
  horizon: "short" | "medium" | "long";
  metricKey: string;
  targetValue: string;
  targetDate: string;
  comparisonOperator: "greater_or_equal" | "less_or_equal" | "equals" | "manual";
  riskCapValue: string;
  notes: string;
};

type ProgressStatus = "achieved" | "in_progress" | "attention" | "long_term";
type ProgressForm = Record<string, { currentValue: string; progressPct: string; status: ProgressStatus }>;
type GoalEditForm = GoalForm & { manualCurrentValue: string };

export function GoalManager({
  availablePeriods,
  initialGoals,
  defaultPeriod,
}: {
  availablePeriods: Array<{ periodMonth: string; status: string }>;
  initialGoals: Goal[];
  defaultPeriod: string;
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [periodMonth, setPeriodMonth] = useState(defaultPeriod);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GoalEditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalForm>({
    title: "",
    horizon: "short",
    metricKey: "manual",
    targetValue: "",
    targetDate: "",
    comparisonOperator: "greater_or_equal",
    riskCapValue: "",
    notes: "",
  });
  const [progressForms, setProgressForms] = useState<ProgressForm>(buildProgressForms(initialGoals));

  const grouped = {
    short: goals.filter((goal) => goal.horizon === "short"),
    medium: goals.filter((goal) => goal.horizon === "medium"),
    long: goals.filter((goal) => goal.horizon === "long"),
  };

  async function loadGoals(nextPeriodMonth = periodMonth) {
    setLoadingGoals(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/goals?period_month=${nextPeriodMonth}`);
      if (!response.ok) {
        setMessage("Não foi possível carregar as metas.");
        return;
      }
      const payload = await response.json();
      const nextGoals = Array.isArray(payload) ? payload : [];
      setGoals(nextGoals);
      setProgressForms(buildProgressForms(nextGoals));
    } finally {
      setLoadingGoals(false);
    }
  }

  async function createGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(serializeGoalForm(form, "0")),
    });

    if (!response.ok) {
      setMessage("Não foi possível criar a meta.");
      return;
    }

    const created = await response.json();
    setForm({
      title: "",
      horizon: "short",
      metricKey: "manual",
      targetValue: "",
      targetDate: "",
      comparisonOperator: "greater_or_equal",
      riskCapValue: "",
      notes: "",
    });
    setMessage("Meta criada.");
    if (created.id) await loadGoals();
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setEditForm({
      title: goal.title,
      horizon: normalizeHorizon(goal.horizon),
      metricKey: goal.metricKey,
      targetValue: goal.targetValue ?? "",
      targetDate: goal.targetDate ?? "",
      comparisonOperator: goal.comparisonOperator,
      riskCapValue: goal.riskCapValue ?? "",
      notes: goal.notes ?? "",
      manualCurrentValue: goal.currentValue ?? "",
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveGoal(goalId: string) {
    if (!editForm) return;
    setSavingId(goalId);
    setMessage(null);
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serializeGoalForm(editForm, editForm.manualCurrentValue)),
      });
      if (!response.ok) {
        setMessage("Não foi possível atualizar a meta.");
        return;
      }
      cancelEdit();
      setMessage("Meta atualizada.");
      await loadGoals();
    } finally {
      setSavingId(null);
    }
  }

  async function deleteGoal(goalId: string) {
    if (!window.confirm("Remover esta meta?")) return;
    setDeletingId(goalId);
    setMessage(null);
    try {
      const response = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage("Não foi possível remover a meta.");
        return;
      }
      if (editingId === goalId) cancelEdit();
      setMessage("Meta removida.");
      await loadGoals();
    } finally {
      setDeletingId(null);
    }
  }

  async function saveProgress(goalId: string) {
    const progress = progressForms[goalId];
    if (!progress) return;
    setMessage(null);
    const response = await fetch(`/api/goals/${goalId}/manual-progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        periodMonth: `${periodMonth}-01`,
        currentValue: progress.currentValue,
        progressPct: Number(progress.progressPct) / 100,
        status: progress.status,
      }),
    });
    if (!response.ok) {
      setMessage("Não foi possível atualizar o progresso.");
      return;
    }
    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              currentValue: progress.currentValue,
              progressPct: Number(progress.progressPct) / 100,
              status: progress.status,
              progressSource: "manual",
            }
          : goal,
      ),
    );
    setMessage("Progresso atualizado.");
  }

  async function changePeriod(nextPeriodMonth: string) {
    setPeriodMonth(nextPeriodMonth);
    await loadGoals(nextPeriodMonth);
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[0.72fr_1.28fr]">
      <Panel>
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-green" />
          <h2 className="text-base font-semibold text-white">Nova meta</h2>
        </div>
        <form onSubmit={createGoal} className="mt-4 space-y-3">
          <Input placeholder="Título" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={form.horizon} onChange={(event) => setForm({ ...form, horizon: event.target.value as GoalForm["horizon"] })} className="w-full">
              <option value="short">Curto prazo</option>
              <option value="medium">Médio prazo</option>
              <option value="long">Longo prazo</option>
            </Select>
            <Select
              value={form.comparisonOperator}
              onChange={(event) => setForm({ ...form, comparisonOperator: event.target.value as GoalForm["comparisonOperator"] })}
              className="w-full"
            >
              <option value="greater_or_equal">Maior e melhor</option>
              <option value="less_or_equal">Menor e melhor</option>
              <option value="equals">Igual a</option>
              <option value="manual">Manual</option>
            </Select>
          </div>
          <Input placeholder="Chave da métrica, ex: pl_total" value={form.metricKey} onChange={(event) => setForm({ ...form, metricKey: event.target.value })} className="w-full" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Alvo" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} className="w-full" />
            <Input placeholder="Prazo" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} className="w-full" />
          </div>
          {form.comparisonOperator === "less_or_equal" ? (
            <Input placeholder="Limite de risco" value={form.riskCapValue} onChange={(event) => setForm({ ...form, riskCapValue: event.target.value })} className="w-full" />
          ) : null}
          <Input placeholder="Notas" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full" />
          <Button type="submit">
            <Plus className="h-4 w-4" />
            Criar meta
          </Button>
        </form>
        <div className="mt-6 rounded-md border border-line bg-ink p-3">
          <label className="text-sm text-slate-300">
            Mês de referência
            {availablePeriods.length ? (
              <Select value={periodMonth} onChange={(event) => void changePeriod(event.target.value)} className="mt-2 w-full">
                {dedupePeriods(availablePeriods).map((period) => (
                  <option key={period.periodMonth} value={period.periodMonth.slice(0, 7)}>
                    {period.periodMonth.slice(0, 7)}
                  </option>
                ))}
              </Select>
            ) : (
              <Input type="month" value={periodMonth} onChange={(event) => void changePeriod(event.target.value)} className="mt-2 w-full" />
            )}
          </label>
          <p className="mt-2 text-xs text-slate-500">Metas quantitativas usam os KPIs recalculados do mês; progresso manual substitui essa prévia.</p>
        </div>
        {loadingGoals ? <p className="mt-4 text-sm text-slate-400">Carregando metas...</p> : null}
        {message ? <p className="mt-4 rounded-md border border-line bg-ink p-3 text-sm text-slate-300">{message}</p> : null}
      </Panel>

      <div className="space-y-4">
        <GoalSection
          title="Curto prazo"
          goals={grouped.short}
          progressForms={progressForms}
          setProgressForms={setProgressForms}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          savingId={savingId}
          deletingId={deletingId}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveGoal={saveGoal}
          deleteGoal={deleteGoal}
          saveProgress={saveProgress}
        />
        <GoalSection
          title="Médio prazo"
          goals={grouped.medium}
          progressForms={progressForms}
          setProgressForms={setProgressForms}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          savingId={savingId}
          deletingId={deletingId}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveGoal={saveGoal}
          deleteGoal={deleteGoal}
          saveProgress={saveProgress}
        />
        <GoalSection
          title="Longo prazo"
          goals={grouped.long}
          progressForms={progressForms}
          setProgressForms={setProgressForms}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          savingId={savingId}
          deletingId={deletingId}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveGoal={saveGoal}
          deleteGoal={deleteGoal}
          saveProgress={saveProgress}
        />
      </div>
    </div>
  );
}

function GoalSection({
  title,
  goals,
  progressForms,
  setProgressForms,
  editingId,
  editForm,
  setEditForm,
  savingId,
  deletingId,
  startEdit,
  cancelEdit,
  saveGoal,
  deleteGoal,
  saveProgress,
}: {
  title: string;
  goals: Goal[];
  progressForms: ProgressForm;
  setProgressForms: React.Dispatch<React.SetStateAction<ProgressForm>>;
  editingId: string | null;
  editForm: GoalEditForm | null;
  setEditForm: React.Dispatch<React.SetStateAction<GoalEditForm | null>>;
  savingId: string | null;
  deletingId: string | null;
  startEdit: (goal: Goal) => void;
  cancelEdit: () => void;
  saveGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  saveProgress: (goalId: string) => Promise<void>;
}) {
  return (
    <Panel>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {goals.map((goal) => {
          const isEditing = editingId === goal.id && editForm;
          return (
            <article key={goal.id} className="min-w-0 rounded-md border border-line bg-ink p-4">
              {isEditing ? (
                <div className="grid gap-2">
                  <Input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="w-full" aria-label="Título da meta" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={editForm.horizon} onChange={(event) => setEditForm({ ...editForm, horizon: event.target.value as GoalForm["horizon"] })} aria-label="Horizonte da meta">
                      <option value="short">Curto prazo</option>
                      <option value="medium">Médio prazo</option>
                      <option value="long">Longo prazo</option>
                    </Select>
                    <Select
                      value={editForm.comparisonOperator}
                      onChange={(event) => setEditForm({ ...editForm, comparisonOperator: event.target.value as GoalForm["comparisonOperator"] })}
                      aria-label="Comparação da meta"
                    >
                      <option value="greater_or_equal">Maior e melhor</option>
                      <option value="less_or_equal">Menor e melhor</option>
                      <option value="equals">Igual a</option>
                      <option value="manual">Manual</option>
                    </Select>
                  </div>
                  <Input value={editForm.metricKey} onChange={(event) => setEditForm({ ...editForm, metricKey: event.target.value })} className="w-full" aria-label="Chave da métrica" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={editForm.targetValue} onChange={(event) => setEditForm({ ...editForm, targetValue: event.target.value })} aria-label="Alvo da meta" />
                    <Input value={editForm.targetDate} onChange={(event) => setEditForm({ ...editForm, targetDate: event.target.value })} aria-label="Prazo da meta" />
                  </div>
                  {editForm.comparisonOperator === "less_or_equal" ? (
                    <Input value={editForm.riskCapValue} onChange={(event) => setEditForm({ ...editForm, riskCapValue: event.target.value })} className="w-full" aria-label="Limite de risco" />
                  ) : null}
                  {editForm.comparisonOperator === "manual" ? (
                    <Input value={editForm.manualCurrentValue} onChange={(event) => setEditForm({ ...editForm, manualCurrentValue: event.target.value })} className="w-full" aria-label="Valor manual atual" />
                  ) : null}
                  <Input value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} className="w-full" aria-label="Notas da meta" />
                  <div className="mt-2 flex justify-end gap-2">
                    <IconButton label="Salvar meta" disabled={savingId === goal.id || !editForm.title || !editForm.metricKey} onClick={() => void saveGoal(goal.id)}>
                      <Save className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Cancelar edição" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold leading-5 text-white">{goal.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{goal.metricKey}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span className="rounded-md border border-line px-2 py-1 text-xs text-slate-400">{goal.status}</span>
                      <IconButton label="Editar meta" onClick={() => startEdit(goal)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Remover meta" danger disabled={deletingId === goal.id} onClick={() => void deleteGoal(goal.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                  <div className="mt-3 inline-flex rounded-md border border-line px-2 py-1 text-xs text-slate-500">
                    {goal.progressSource === "calculated" ? "Calculado" : goal.progressSource === "manual" ? "Manual" : "Sem progresso"}
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-panel2">
                    <div className="h-2 rounded-full bg-green" style={{ width: `${Math.min(goal.progressPct * 100, 100)}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{percent(goal.progressPct, 1)}</span>
                    <span>{goal.targetDate ?? ""}</span>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Atual: {goal.currentValue || "-"} - Alvo: {goal.targetValue || "-"}
                  </div>
                  {goal.requiredCagr !== null ? (
                    <div className="mt-2 text-xs font-medium text-amber">
                      CAGR necessário: {percent(goal.requiredCagr, 1)} a.a.
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-2">
                    <Input
                      value={progressForms[goal.id]?.currentValue ?? ""}
                      onChange={(event) =>
                        setProgressForms((current) => ({
                          ...current,
                          [goal.id]: { ...(current[goal.id] ?? { progressPct: "0", status: "in_progress" }), currentValue: event.target.value },
                        }))
                      }
                      placeholder="Valor/status atual"
                      className="w-full min-w-0"
                    />
                    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-2">
                      <Input
                        value={progressForms[goal.id]?.progressPct ?? "0"}
                        onChange={(event) =>
                          setProgressForms((current) => ({
                            ...current,
                            [goal.id]: { ...(current[goal.id] ?? { currentValue: "", status: "in_progress" }), progressPct: event.target.value },
                          }))
                        }
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        aria-label={`Progresso de ${goal.title}`}
                        className="min-w-0"
                      />
                      <Select
                        value={progressForms[goal.id]?.status ?? "in_progress"}
                        onChange={(event) =>
                          setProgressForms((current) => ({
                            ...current,
                            [goal.id]: {
                              ...(current[goal.id] ?? { currentValue: "", progressPct: "0" }),
                              status: event.target.value as ProgressStatus,
                            },
                          }))
                        }
                        aria-label={`Status de ${goal.title}`}
                        className="min-w-0"
                      >
                        <option value="in_progress">Em progresso</option>
                        <option value="achieved">Atingida</option>
                        <option value="attention">Atenção</option>
                        <option value="long_term">Longo prazo</option>
                      </Select>
                      <IconButton label="Salvar progresso" onClick={() => void saveProgress(goal.id)}>
                        <Save className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function normalizeStatus(value: string): ProgressStatus {
  if (value === "achieved" || value === "attention" || value === "long_term") return value;
  return "in_progress";
}

function normalizeHorizon(value: string): GoalForm["horizon"] {
  if (value === "medium" || value === "long") return value;
  return "short";
}

function serializeGoalForm(source: GoalForm, manualCurrentValue: string | null = null) {
  const numericRisk = Number(source.riskCapValue.replace(",", "."));
  return {
    title: source.title,
    horizon: source.horizon,
    metricKey: source.metricKey,
    targetValue: parseFlexibleTarget(source.targetValue),
    targetDate: source.targetDate || null,
    comparisonOperator: source.comparisonOperator,
    riskCapValue: source.riskCapValue.trim() && Number.isFinite(numericRisk) ? numericRisk : null,
    manualCurrentValue: source.comparisonOperator === "manual" ? manualCurrentValue : null,
    notes: source.notes || null,
  };
}

function parseFlexibleTarget(value: string) {
  const trimmed = value.trim();
  const numericTarget = Number(trimmed.replace(",", "."));
  if (trimmed !== "" && Number.isFinite(numericTarget)) return numericTarget;
  return trimmed || null;
}

function buildProgressForms(goals: Goal[]): ProgressForm {
  return Object.fromEntries(
    goals.map((goal) => [
      goal.id,
      {
        currentValue: goal.currentValue || "",
        progressPct: String(Math.round(goal.progressPct * 100)),
        status: normalizeStatus(goal.status),
      },
    ]),
  );
}

function dedupePeriods(periods: Array<{ periodMonth: string; status: string }>) {
  const seen = new Set<string>();
  return periods.filter((period) => {
    const key = period.periodMonth.slice(0, 7);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function IconButton({
  label,
  children,
  danger,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={[
        "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-slate-300 disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "hover:border-red-400 hover:text-red-300" : "hover:border-cyan hover:text-white",
        props.className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
