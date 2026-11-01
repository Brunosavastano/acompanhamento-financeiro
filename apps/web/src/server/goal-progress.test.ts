import { describe, expect, it } from "vitest";
import { pickClosestGoals, resolveGoalProgress, type GoalForProgress } from "./goal-progress";

const base: GoalForProgress = {
  horizon: "short",
  metricKey: "pl_total",
  comparisonOperator: "greater_or_equal",
  targetValueDecimal: { toString: () => "500000" },
  targetValueText: null,
  riskCapValue: null,
  manualCurrentValue: null,
};

describe("resolveGoalProgress", () => {
  it("calcula metas com métrica do app ao vivo, ignorando o valor congelado no fechamento", () => {
    const stale = { currentValue: "307361.47", progressPct: 0.615, status: "in_progress" as const };
    const resolved = resolveGoalProgress(base, { pl_total: 271579.17 }, stale);
    expect(resolved.currentValue).toBe("271579,17");
    expect(resolved.progressPct).toBeCloseTo(0.5432, 4);
    expect(resolved.status).toBe("attention"); // curto prazo abaixo de 70%, como na planilha
    expect(resolved.progressSource).toBe("calculated");
  });

  it("aceita alvo digitado em formato brasileiro sem quebrar", () => {
    const goal = { ...base, targetValueDecimal: null, targetValueText: "1.000.000", horizon: "medium" as const };
    const resolved = resolveGoalProgress(goal, { pl_total: 250000 }, null);
    expect(resolved.progressPct).toBe(0.25);
    expect(resolved.status).toBe("long_term");
  });

  it("mantém o progresso de metas manuais entre os meses em vez de zerar", () => {
    const goal: GoalForProgress = {
      ...base,
      horizon: "medium",
      metricKey: "cfa_charter",
      comparisonOperator: "manual",
      targetValueDecimal: null,
      targetValueText: "Charterholder",
      manualCurrentValue: "Aprovado L2",
    };
    const resolved = resolveGoalProgress(goal, { pl_total: 1 }, { currentValue: "Aprovado L2", progressPct: 0.33, status: "in_progress" });
    expect(resolved.currentValue).toBe("Aprovado L2");
    expect(resolved.progressPct).toBe(0.33);
    expect(resolved.progressSource).toBe("manual");
  });

  it("usa o valor informado em metas numéricas sem métrica do app (ex.: renda)", () => {
    const goal: GoalForProgress = {
      ...base,
      horizon: "medium",
      metricKey: "renda_liquida_mensal",
      targetValueDecimal: { toString: () => "30000" },
      manualCurrentValue: "16500",
    };
    const resolved = resolveGoalProgress(goal, { pl_total: 1 }, { currentValue: "16.500", progressPct: 0.5, status: "attention" });
    expect(resolved.currentValue).toBe("16.500");
    expect(resolved.currentNumeric).toBe(16500); // "16.500" digitado = dezesseis mil e quinhentos
    expect(resolved.progressPct).toBe(0.55);
    expect(resolved.status).toBe("in_progress");
  });

  it("mostra o registro do próprio mês, não o valor mais novo da meta", () => {
    const goal: GoalForProgress = {
      ...base,
      horizon: "medium",
      metricKey: "renda_liquida_mensal",
      targetValueDecimal: { toString: () => "30000" },
      manualCurrentValue: "20000", // informado em novembro
    };
    const september = resolveGoalProgress(goal, {}, { currentValue: "16500", progressPct: 0.55, status: "in_progress" });
    expect(september.currentValue).toBe("16500");
    expect(september.progressPct).toBe(0.55);
  });

  it("com alvo em texto, preserva o % informado em vez de zerar", () => {
    const goal: GoalForProgress = {
      ...base,
      horizon: "medium",
      metricKey: "renda_passiva_mensal",
      targetValueDecimal: null,
      targetValueText: "5 mil por mês",
    };
    const resolved = resolveGoalProgress(goal, {}, { currentValue: "3000", progressPct: 0.6, status: "in_progress" });
    expect(resolved.progressPct).toBe(0.6);
    expect(resolved.targetNumeric).toBeNull();
  });

  it("lê alvo Decimal com 3 casas (0.125) como decimal, nunca como milhar", () => {
    const savings = { ...base, metricKey: "tx_poupanca", targetValueDecimal: { toString: () => "0.125" } };
    expect(resolveGoalProgress(savings, { tx_poupanca: 0.2 }, null)).toMatchObject({ targetNumeric: 0.125, progressPct: 1, status: "achieved" });

    const debt: GoalForProgress = { ...base, metricKey: "divida_ativos", comparisonOperator: "less_or_equal", targetValueDecimal: { toString: () => "0.025" } };
    const debtProgress = resolveGoalProgress(debt, { divida_ativos: 0.152 }, null);
    expect(debtProgress.targetNumeric).toBe(0.025);
    expect(debtProgress.status).not.toBe("achieved");
  });

  it("respeita o status escolhido pelo usuário em metas manuais", () => {
    const goal: GoalForProgress = { ...base, horizon: "long", metricKey: "status", comparisonOperator: "manual", manualCurrentValue: "Estruturando" };
    expect(resolveGoalProgress(goal, {}, { currentValue: "Estruturando", progressPct: 0, status: "attention" }).status).toBe("attention");
    expect(resolveGoalProgress(goal, {}, { currentValue: "Captando", progressPct: 0.4, status: "in_progress" }).status).toBe("in_progress");
    // sem nenhum registro, o status sai do progresso e do horizonte
    expect(resolveGoalProgress(goal, {}, null).status).toBe("long_term");
  });

  it("marca como vazia a meta sem nenhum valor", () => {
    const goal = { ...base, metricKey: "aum", horizon: "long" as const };
    expect(resolveGoalProgress(goal, {}, null)).toMatchObject({ progressPct: 0, status: "long_term", progressSource: "empty" });
  });
});

describe("pickClosestGoals", () => {
  it("prioriza metas de curto prazo em andamento e exclui as atingidas", () => {
    const picked = pickClosestGoals([
      { title: "atingida", horizon: "short", progressPct: 1 },
      { title: "longa alta", horizon: "long", progressPct: 0.9 },
      { title: "curta 82", horizon: "short", progressPct: 0.82 },
      { title: "curta 54", horizon: "short", progressPct: 0.54 },
      { title: "curta 75", horizon: "short", progressPct: 0.75 },
      { title: "curta 10", horizon: "short", progressPct: 0.1 },
    ]);
    expect(picked.map((goal) => goal.title)).toEqual(["curta 82", "curta 75", "curta 54"]);
  });
});
