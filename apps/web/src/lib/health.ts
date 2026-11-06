// Faixas dos cards de "Saúde financeira" da visão geral. Ficam aqui (e não na
// página) porque as explicações (ⓘ) e os alertas usam os mesmos limites.

import { number } from "@/lib/format";

export type HealthTone = "positive" | "gold" | "negative";
export type Health = { badge: string; tone: HealthTone };

/** Meta de meses de reserva quando a família não cadastrou uma meta "meses de reserva". */
export const DEFAULT_RESERVE_TARGET_MONTHS = 6;

/** Meta em meses como os textos mostram: "6" ou "4,5". */
export function formatTargetMonths(value: number) {
  return number(value, Number.isInteger(value) ? 0 : 1);
}

/** Reserva em fração da meta: a partir de 75% está "quase lá"; abaixo de 40% pede atenção. */
export const RESERVE_BANDS = { almost: 0.75, building: 0.4 } as const;

/** Dívidas do cartão (a valor presente) em relação aos bens: até 5% sob controle, acima de 15% alto. */
export const DEBT_TO_ASSETS_BANDS = { controlled: 0.05, attention: 0.15 } as const;

/** Sobra planejada em relação à renda: a partir de 20% ótimo ritmo, de 10% bom ritmo. */
export const SAVINGS_RATE_BANDS = { great: 0.2, good: 0.1 } as const;

/** Renda comprometida: até 60% confortável, acima de 85% crítico. */
export const INCOME_COMMITMENT_BANDS = { comfortable: 0.6, attention: 0.85 } as const;

/** `ratio` = meses de reserva ÷ meta. */
export function reserveHealth(ratio: number): Health {
  if (ratio >= 1) return { badge: "Meta atingida", tone: "positive" };
  if (ratio >= RESERVE_BANDS.almost) return { badge: "Quase lá", tone: "gold" };
  if (ratio >= RESERVE_BANDS.building) return { badge: "Em construção", tone: "gold" };
  return { badge: "Atenção", tone: "negative" };
}

export function debtHealth(debtToAssets: number): Health {
  if (debtToAssets <= DEBT_TO_ASSETS_BANDS.controlled) return { badge: "Sob controle", tone: "positive" };
  if (debtToAssets <= DEBT_TO_ASSETS_BANDS.attention) return { badge: "Exige atenção", tone: "gold" };
  return { badge: "Alto", tone: "negative" };
}

export function savingsHealth(budgetSavingsRate: number): Health {
  if (budgetSavingsRate >= SAVINGS_RATE_BANDS.great) return { badge: "Ótimo ritmo", tone: "positive" };
  if (budgetSavingsRate >= SAVINGS_RATE_BANDS.good) return { badge: "Bom ritmo", tone: "positive" };
  if (budgetSavingsRate >= 0) return { badge: "Ritmo baixo", tone: "gold" };
  return { badge: "No vermelho", tone: "negative" };
}

export function commitmentHealth(incomeCommitment: number): Health {
  if (incomeCommitment <= INCOME_COMMITMENT_BANDS.comfortable) return { badge: "Confortável", tone: "positive" };
  if (incomeCommitment <= INCOME_COMMITMENT_BANDS.attention) return { badge: "Atenção", tone: "negative" };
  return { badge: "Crítico", tone: "negative" };
}
