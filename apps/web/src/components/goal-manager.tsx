"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { currency, number, percent } from "@/lib/format";
import { Input, Select } from "@/components/ui";

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
  comparisonOperator: Goal["comparisonOperator"];
  riskCapValue: string;
  notes: string;
};

type ProgressStatus = "achieved" | "in_progress" | "attention" | "long_term";
type GoalEditForm = GoalForm & { manualCurrentValue: string };

type Tone = "gold" | "green" | "rose" | "slate";

const tones: Record<Tone, { ring: string; pill: string }> = {
  gold: { ring: "#C9A96E", pill: "bg-gold/[0.14] text-gold-light" },
  green: { ring: "#5BCB8D", pill: "bg-positive/[0.12] text-positive-text" },
  rose: { ring: "#E0688F", pill: "bg-negative/[0.12] text-negative-text" },
  slate: { ring: "#6E9BD8", pill: "bg-info/[0.12] text-info-text" },
};

function goalPresentation(goal: Goal): { tone: Tone; pill: string } {
  if (goal.status === "achieved") return { tone: "green", pill: "Atingida" };
  if (goal.status === "attention") return { tone: "rose", pill: "Atenção" };
  if (goal.status === "long_term") return { tone: "slate", pill: "Longo prazo" };
  if (goal.progressPct >= 0.75) return { tone: "gold", pill: "Quase lá" };
  return { tone: "slate", pill: "Em progresso" };
}

const percentKeys = new Set(["invest_ativos", "divida_ativos", "tx_poupanca"]);
const moneyKeys = new Set(["pl_total", "invest_total", "caixa_total"]);

function formatGoalValue(metricKey: string, value: string | null) {
  if (value === null || value.trim() === "") return "—";
  // Valores da API usam ponto decimal ("4.96"); só interpreta como pt-BR se Number falhar.
  const direct = Number(value);
  const numeric = Number.isFinite(direct) ? direct : Number(value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return value;
  if (percentKeys.has(metricKey)) return percent(numeric, 1);
  if (moneyKeys.has(metricKey)) return currency(numeric);
  if (metricKey === "meses_de_reserva") return `${number(numeric, 1)} meses`;
  return number(numeric, Number.isInteger(numeric) ? 0 : 2);
}

function formatDeadline(targetDate: string | null) {
  if (!targetDate) return "—";
  if (/^\d{4}-\d{2}/.test(targetDate)) {
    const date = new Date(`${targetDate.slice(0, 7)}-01`);
    const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
    return `${month}/${String(date.getUTCFullYear()).slice(2)}`;
  }
  return targetDate;
}

const sourceLabels: Record<Goal["progressSource"], string> = {
  calculated: "Calculado pelo app",
  manual: "Progresso manual",
  empty: "Sem progresso registrado",
};

const emptyGoalForm = (horizon: GoalForm["horizon"]): GoalForm => ({
  title: "",
  horizon,
  metricKey: "manual",
  targetValue: "",
  targetDate: "",
  comparisonOperator: "greater_or_equal",
  riskCapValue: "",
  notes: "",
});

export function GoalManager({ period, initialGoals }: { period: string; initialGoals: Goal[] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [message, setMessage] = useState<string | null>(null);
  const [addingHorizon, setAddingHorizon] = useState<GoalForm["horizon"] | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyGoalForm("short"));
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GoalEditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [progressId, setProgressId] = useState<string | null>(null);
  const [progressForm, setProgressForm] = useState({ currentValue: "", progressPct: "0", status: "in_progress" as ProgressStatus });
  const [savingProgress, setSavingProgress] = useState(false);

  const sections: { horizon: GoalForm["horizon"]; title: string; subtitle: string }[] = [
    { horizon: "short", title: "Curto prazo", subtitle: "até 1 ano" },
    { horizon: "medium", title: "Médio prazo", subtitle: "1 a 5 anos" },
    { horizon: "long", title: "Longo prazo", subtitle: "5+ anos" },
  ];

  async function loadGoals() {
    const response = await fetch(`/api/goals?period_month=${period}`);
    if (!response.ok) {
      setMessage("Não foi possível recarregar as metas.");
      return;
    }
    const payload = await response.json();
    setGoals(Array.isArray(payload) ? payload : []);
  }

  async function createGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serializeGoalForm(form, "0")),
      });
      if (!response.ok) {
        setMessage("Não foi possível criar a meta.");
        return;
      }
      setAddingHorizon(null);
      setMessage("Meta criada.");
      await loadGoals();
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setProgressId(null);
    setAddingHorizon(null);
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

  function openProgress(goal: Goal) {
    setProgressId(goal.id);
    setEditingId(null);
    setEditForm(null);
    setProgressForm({
      currentValue: goal.currentValue ?? "",
      progressPct: String(Math.round(goal.progressPct * 100)),
      status: normalizeStatus(goal.status),
    });
    setMessage(null);
  }

  async function saveProgress(goalId: string) {
    setSavingProgress(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/goals/${goalId}/manual-progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodMonth: `${period}-01`,
          currentValue: progressForm.currentValue,
          progressPct: Number(progressForm.progressPct) / 100,
          status: progressForm.status,
        }),
      });
      if (!response.ok) {
        setMessage("Não foi possível atualizar o progresso.");
        return;
      }
      setProgressId(null);
      setMessage("Progresso atualizado.");
      await loadGoals();
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {message ? (
        <p role="status" className="rounded-[10px] border border-edge bg-surface-2 px-4 py-3 text-[13px] text-body">
          {message}
        </p>
      ) : null}

      {sections.map((section) => {
        const sectionGoals = goals.filter((goal) => normalizeHorizon(goal.horizon) === section.horizon);
        return (
          <section key={section.horizon}>
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-lg font-normal text-snow">{section.title}</h2>
              <span className="text-xs text-faint">{section.subtitle}</span>
            </div>
            <div className="mt-3.5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {sectionGoals.map((goal) => {
                if (editingId === goal.id && editForm) {
                  return (
                    <GoalFormCard
                      key={goal.id}
                      form={editForm}
                      setForm={(next) => setEditForm({ ...next, manualCurrentValue: (next as GoalEditForm).manualCurrentValue ?? editForm.manualCurrentValue })}
                      manualCurrentValue={editForm.manualCurrentValue}
                      setManualCurrentValue={(value) => setEditForm({ ...editForm, manualCurrentValue: value })}
                      busy={savingId === goal.id}
                      submitLabel="Salvar"
                      onSubmit={() => void saveGoal(goal.id)}
                      onCancel={cancelEdit}
                    />
                  );
                }
                const presentation = goalPresentation(goal);
                return (
                  <article key={goal.id} className="flex min-w-0 flex-col gap-3.5 rounded-[14px] border border-edge bg-surface p-5">
                    <div className="flex items-start gap-3.5">
                      <ProgressRing pct={goal.progressPct} tone={presentation.tone} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="break-words text-sm font-semibold leading-[19px] text-snow">{goal.title}</h3>
                          <span className={clsx("shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold", tones[presentation.tone].pill)}>
                            {presentation.pill}
                          </span>
                        </div>
                        {goal.notes ? <p className="mt-1.5 text-xs leading-[17px] text-muted">{goal.notes}</p> : null}
                      </div>
                    </div>
                    <div className="flex overflow-hidden rounded-[10px] border border-edge-soft bg-surface-2">
                      <GoalStat label="Atual" value={formatGoalValue(goal.metricKey, goal.currentValue)} />
                      <GoalStat label="Alvo" value={formatGoalValue(goal.metricKey, goal.targetValue)} withBorder />
                      <GoalStat label="Prazo" value={formatDeadline(goal.targetDate)} withBorder />
                    </div>
                    {goal.requiredCagr !== null ? (
                      <p className="text-[11px] text-gold-light">
                        Precisa crescer {percent(goal.requiredCagr, 1)} ao ano para chegar no prazo.
                      </p>
                    ) : null}
                    {progressId === goal.id ? (
                      <div className="rounded-[10px] border border-edge bg-surface-2 p-3">
                        <div className="grid grid-cols-2 gap-2.5">
                          <Input
                            placeholder="Valor atual"
                            aria-label="Valor atual"
                            value={progressForm.currentValue}
                            onChange={(event) => setProgressForm({ ...progressForm, currentValue: event.target.value })}
                            className="w-full bg-surface"
                          />
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            aria-label="Progresso em %"
                            placeholder="%"
                            value={progressForm.progressPct}
                            onChange={(event) => setProgressForm({ ...progressForm, progressPct: event.target.value })}
                            className="w-full bg-surface text-right tabular-nums"
                          />
                        </div>
                        <div className="mt-2.5 flex gap-2.5">
                          <Select
                            aria-label="Status da meta"
                            value={progressForm.status}
                            onChange={(event) => setProgressForm({ ...progressForm, status: event.target.value as ProgressStatus })}
                            className="min-w-0 flex-1 bg-surface"
                          >
                            <option value="in_progress">Em progresso</option>
                            <option value="achieved">Atingida</option>
                            <option value="attention">Atenção</option>
                            <option value="long_term">Longo prazo</option>
                          </Select>
                          <button
                            type="button"
                            onClick={() => void saveProgress(goal.id)}
                            disabled={savingProgress}
                            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-sidebar hover:bg-gold-light disabled:opacity-60"
                          >
                            {savingProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setProgressId(null)}
                            className="focus-ring rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-body hover:border-muted"
                          >
                            Cancelar
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] leading-[14px] text-faint">
                          O progresso manual vale para o mês de referência e substitui o valor calculado.
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge-soft pt-3">
                      <span className="text-[11px] text-faint">{sourceLabels[goal.progressSource]}</span>
                      <div className="flex items-center gap-1">
                        <IconButton label={`Editar meta ${goal.title}`} onClick={() => startEdit(goal)}>
                          <Pencil className="h-[13px] w-[13px]" />
                        </IconButton>
                        <IconButton label={`Remover meta ${goal.title}`} danger disabled={deletingId === goal.id} onClick={() => void deleteGoal(goal.id)}>
                          {deletingId === goal.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Trash2 className="h-[13px] w-[13px]" />}
                        </IconButton>
                        <button
                          type="button"
                          onClick={() => (progressId === goal.id ? setProgressId(null) : openProgress(goal))}
                          className="focus-ring ml-1 rounded-lg border border-edge px-3 py-1.5 text-[11px] font-semibold text-body hover:border-gold hover:text-gold-light"
                        >
                          Atualizar progresso
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {addingHorizon === section.horizon ? (
                <GoalFormCard
                  form={form}
                  setForm={setForm}
                  busy={isCreating}
                  submitLabel="Criar meta"
                  onSubmit={createGoal}
                  onCancel={() => setAddingHorizon(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingHorizon(section.horizon);
                    setForm(emptyGoalForm(section.horizon));
                    setEditingId(null);
                    setEditForm(null);
                    setProgressId(null);
                    setMessage(null);
                  }}
                  className="focus-ring flex min-h-[120px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-edge text-[13px] font-medium text-muted hover:border-gold hover:text-gold-light"
                >
                  <Plus className="h-[15px] w-[15px]" aria-hidden />
                  Nova meta de {section.title.toLowerCase()}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProgressRing({ pct, tone }: { pct: number; tone: Tone }) {
  const circumference = 2 * Math.PI * 23;
  const clamped = Math.max(0, Math.min(pct, 1));
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" className="shrink-0" role="img" aria-label={`${Math.round(clamped * 100)}% da meta`}>
      <circle cx="27" cy="27" r="23" fill="none" stroke="#141D33" strokeWidth="5" />
      <circle
        cx="27"
        cy="27"
        r="23"
        fill="none"
        stroke={tones[tone].ring}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * clamped} ${circumference}`}
        transform="rotate(-90 27 27)"
      />
      <text x="27" y="31" textAnchor="middle" fill="#EEF2FA" fontSize="12" fontWeight="600">
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  );
}

function GoalStat({ label, value, withBorder }: { label: string; value: string; withBorder?: boolean }) {
  return (
    <div className={clsx("min-w-0 flex-1 px-3 py-2.5", withBorder && "border-l border-edge-soft")}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-snow" title={value}>
        {value}
      </div>
    </div>
  );
}

function GoalFormCard({
  form,
  setForm,
  manualCurrentValue,
  setManualCurrentValue,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  form: GoalForm;
  setForm: (form: GoalForm) => void;
  manualCurrentValue?: string;
  setManualCurrentValue?: (value: string) => void;
  busy: boolean;
  submitLabel: string;
  onSubmit: ((event: React.FormEvent<HTMLFormElement>) => void) | (() => void);
  onCancel: () => void;
}) {
  const canSubmit = !busy && form.title.trim() !== "" && form.metricKey.trim() !== "";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        void (onSubmit as (event: React.FormEvent<HTMLFormElement>) => void)(event);
      }}
      className="flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-edge bg-surface-2 p-4"
    >
      <Input placeholder="Título da meta" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full bg-surface" />
      <Input
        placeholder="Descrição em linguagem simples (opcional)"
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
        className="w-full bg-surface"
      />
      <div className="grid grid-cols-2 gap-2.5">
        <Select
          aria-label="Horizonte"
          value={form.horizon}
          onChange={(event) => setForm({ ...form, horizon: event.target.value as GoalForm["horizon"] })}
          className="w-full bg-surface"
        >
          <option value="short">Curto prazo</option>
          <option value="medium">Médio prazo</option>
          <option value="long">Longo prazo</option>
        </Select>
        <Select
          aria-label="Comparação"
          value={form.comparisonOperator}
          onChange={(event) => setForm({ ...form, comparisonOperator: event.target.value as GoalForm["comparisonOperator"] })}
          className="w-full bg-surface"
        >
          <option value="greater_or_equal">Maior é melhor</option>
          <option value="less_or_equal">Menor é melhor</option>
          <option value="equals">Igual a</option>
          <option value="manual">Manual</option>
        </Select>
      </div>
      <label className="text-[11px] font-semibold text-faint">
        Métrica acompanhada
        <Input
          placeholder="ex.: pl_total, meses_de_reserva ou manual"
          value={form.metricKey}
          onChange={(event) => setForm({ ...form, metricKey: event.target.value })}
          className="mt-1 block w-full bg-surface"
        />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <Input placeholder="Alvo" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} className="w-full bg-surface" />
        <Input placeholder="Prazo (ex.: 2030-12)" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} className="w-full bg-surface" />
      </div>
      {form.comparisonOperator === "less_or_equal" ? (
        <Input
          placeholder="Limite de risco (opcional)"
          value={form.riskCapValue}
          onChange={(event) => setForm({ ...form, riskCapValue: event.target.value })}
          className="w-full bg-surface"
        />
      ) : null}
      {form.comparisonOperator === "manual" && setManualCurrentValue ? (
        <Input
          placeholder="Valor/status atual"
          value={manualCurrentValue ?? ""}
          onChange={(event) => setManualCurrentValue(event.target.value)}
          className="w-full bg-surface"
        />
      ) : null}
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-edge px-3.5 py-2 text-xs font-semibold text-body hover:border-muted">
          <X className="h-3.5 w-3.5" aria-hidden />
          Cancelar
        </button>
      </div>
    </form>
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
      className={clsx(
        "focus-ring inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-faint disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "hover:bg-elevated hover:text-negative-text" : "hover:bg-elevated hover:text-gold-light",
        props.className,
      )}
    >
      {children}
    </button>
  );
}
