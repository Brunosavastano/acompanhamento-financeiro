import {
  calculateGoalProgress,
  goalStatusFor,
  toNumber,
  type GoalHorizonKey,
  type GoalStatusKey,
} from "@finance/financial-calculations";
import { formatLooseNumber, parseLooseNumber } from "@/lib/number-br";

/** Métricas que o app calcula sozinho a cada fechamento. */
export const GOAL_METRIC_KEYS = [
  "meses_de_reserva",
  "invest_ativos",
  "divida_ativos",
  "tx_poupanca",
  "pl_total",
  "invest_total",
  "caixa_total",
] as const;

export type GoalMetricValues = Record<string, number>;

export function metricValuesForGoals(kpis: {
  reserveMonths: number;
  investmentsToAssets: number;
  debtToAssets: number;
  patrimonialSavingsRate: number;
  netWorth: number;
  investmentsTotal: number;
  cashTotal: number;
}): GoalMetricValues {
  return {
    meses_de_reserva: kpis.reserveMonths,
    invest_ativos: kpis.investmentsToAssets,
    divida_ativos: kpis.debtToAssets,
    tx_poupanca: kpis.patrimonialSavingsRate,
    pl_total: kpis.netWorth,
    invest_total: kpis.investmentsTotal,
    caixa_total: kpis.cashTotal,
  };
}

type DecimalLike = { toString(): string };

export type GoalForProgress = {
  horizon: GoalHorizonKey;
  metricKey: string;
  comparisonOperator: "greater_or_equal" | "less_or_equal" | "equals" | "manual";
  targetValueDecimal: DecimalLike | null;
  targetValueText: string | null;
  riskCapValue: DecimalLike | null;
  manualCurrentValue: string | null;
};

export type GoalSnapshotForProgress = {
  currentValue: string;
  progressPct: DecimalLike | number;
  status: GoalStatusKey;
} | null;

export type ResolvedGoalProgress = {
  currentValue: string | null;
  /** Valor atual como número (já interpretado no formato certo), ou null se for texto. */
  currentNumeric: number | null;
  /** Alvo como número, ou null se for texto (ex.: "Level II"). */
  targetNumeric: number | null;
  progressPct: number;
  status: GoalStatusKey;
  progressSource: "calculated" | "manual" | "empty";
};

/** Meta acompanhada por uma métrica do app (progresso automático). */
export function isComputedGoal(goal: Pick<GoalForProgress, "comparisonOperator" | "metricKey">): boolean {
  return goal.comparisonOperator !== "manual" && (GOAL_METRIC_KEYS as readonly string[]).includes(goal.metricKey);
}

export function goalTargetValue(goal: Pick<GoalForProgress, "targetValueDecimal" | "targetValueText">): string | null {
  return goal.targetValueDecimal?.toString() ?? goal.targetValueText ?? null;
}

/** Número de um Decimal do banco (formato canônico "0.125"): nunca passa pelo parser pt-BR. */
function decimalNumber(value: DecimalLike | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Alvo numérico: Decimal gravado (canônico) ou, se a meta foi salva como texto,
 * interpretação pt-BR — aceitando a unidade "meses" ("12 meses" = 12).
 */
export function goalTargetNumber(goal: Pick<GoalForProgress, "targetValueDecimal" | "targetValueText">): number | null {
  if (goal.targetValueDecimal !== null) return decimalNumber(goal.targetValueDecimal);
  const text = goal.targetValueText?.trim().replace(/\s*(meses|m[eê]s)$/i, "") ?? null;
  return parseLooseNumber(text);
}

function progressFor(goal: GoalForProgress, currentValue: number, targetValue: number | null): number {
  return toNumber(
    calculateGoalProgress({
      currentValue,
      targetValue,
      comparisonOperator: goal.comparisonOperator,
      riskCapValue: decimalNumber(goal.riskCapValue),
    }),
  );
}

/**
 * Progresso de uma meta num mês de referência.
 *
 * - Metas com métrica do app: calculadas AO VIVO a partir das métricas do mês
 *   (mesmos números do dashboard; editar o alvo reflete na hora). Sem métricas
 *   do mês, usa o último valor calculado conhecido.
 * - Metas manuais e numéricas sem métrica do app (ex.: renda passiva): vale o
 *   registro mais recente ATÉ o mês (`latestSnapshot`, só os informados pelo
 *   usuário ou pela importação), que segue valendo nos meses seguintes até ser
 *   atualizado; um mês passado mostra o próprio registro. O valor sem data da
 *   meta (`manualCurrentValue`, valor inicial) só vale antes do 1º registro.
 */
export function resolveGoalProgress(
  goal: GoalForProgress,
  metricValues: GoalMetricValues,
  latestSnapshot: GoalSnapshotForProgress,
): ResolvedGoalProgress {
  const snapshotPct = latestSnapshot ? Number(latestSnapshot.progressPct.toString()) : null;
  const targetNumeric = goalTargetNumber(goal);

  if (isComputedGoal(goal)) {
    const metric = metricValues[goal.metricKey];
    if (metric !== undefined && Number.isFinite(metric)) {
      const progressPct = progressFor(goal, metric, targetNumeric);
      return {
        currentValue: formatLooseNumber(metric),
        currentNumeric: metric,
        targetNumeric,
        progressPct,
        status: goalStatusFor(progressPct, goal.horizon),
        progressSource: "calculated",
      };
    }
    if (latestSnapshot && snapshotPct !== null) {
      // valor gravado no fechamento (formato do app, "4,125"; legado "4.96206965")
      return {
        currentValue: latestSnapshot.currentValue,
        currentNumeric: parseLooseNumber(latestSnapshot.currentValue),
        targetNumeric,
        progressPct: snapshotPct,
        status: goalStatusFor(snapshotPct, goal.horizon),
        progressSource: "calculated",
      };
    }
    return { currentValue: null, currentNumeric: null, targetNumeric, progressPct: 0, status: goalStatusFor(0, goal.horizon), progressSource: "empty" };
  }

  // Havendo registro até o mês, ele é a verdade — mesmo vazio. O valor sem
  // data da meta (valor inicial, ex.: da planilha) só vale antes do 1º registro.
  const currentValue = latestSnapshot ? latestSnapshot.currentValue : goal.manualCurrentValue ?? null;
  const hasInput = currentValue !== null && currentValue.trim() !== "";
  // valores digitados por gente: interpretação pt-BR ("5.000" = cinco mil)
  const currentNumeric = parseLooseNumber(currentValue);

  if (goal.comparisonOperator === "manual") {
    const progressPct = snapshotPct ?? 0;
    return {
      currentValue,
      currentNumeric,
      targetNumeric,
      progressPct,
      // status escolhido pelo usuário em "Atualizar progresso" é respeitado
      status: latestSnapshot?.status ?? goalStatusFor(progressPct, goal.horizon),
      progressSource: hasInput || latestSnapshot ? "manual" : "empty",
    };
  }

  // Meta numérica sem métrica do app: progresso pelo valor informado quando
  // valor e alvo são números; com alvo em texto, vale o % informado.
  const progressPct = currentNumeric !== null && targetNumeric !== null ? progressFor(goal, currentNumeric, targetNumeric) : snapshotPct ?? 0;
  return {
    currentValue,
    currentNumeric,
    targetNumeric,
    progressPct,
    status: goalStatusFor(progressPct, goal.horizon),
    progressSource: hasInput ? "manual" : "empty",
  };
}

/** Metas para o painel do dashboard: as de curto prazo mais perto de serem atingidas (sem as já atingidas). */
export function pickClosestGoals<T extends { horizon: string; progressPct: number }>(goals: T[], limit = 3): T[] {
  return goals
    .filter((goal) => goal.progressPct < 1)
    .sort((a, b) => Number(a.horizon !== "short") - Number(b.horizon !== "short") || b.progressPct - a.progressPct)
    .slice(0, limit);
}
