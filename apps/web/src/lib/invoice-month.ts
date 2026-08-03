import { formatPeriod, parseMonthOrNull } from "@/lib/date";

/**
 * Resolve o rótulo de mês exibido em telas de fatura de apps de banco
 * ("Agosto", "Janeiro de 2027", "set/2026") para "YYYY-MM-01".
 *
 * Rótulos sem ano são resolvidos para a ocorrência mais PRÓXIMA do mês-base
 * (empate de 6 meses → futuro): com base ago/2026, "setembro" é 2026-09,
 * "janeiro" é 2027-01 e "julho" é 2026-07 — julho fica ANTES da base de
 * propósito, para a flag before_base sinalizar faturas passadas/fechadas em
 * vez de criá-las silenciosamente um ano à frente. Retorna null quando não
 * reconhece.
 */
export function resolveInvoiceMonthLabel(label: string, baseMonth: string | Date): string | null {
  const base = parseMonthOrNull(baseMonth);
  if (!base) return null;

  const cleaned = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/fatura|atual|futura/g, " ")
    .replace(/\bde\b/g, " ")
    .replace(/[^a-z0-9/ -]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[/ -]+|[/ -]+$/g, "");
  if (!cleaned) return null;

  // Com ano explícito ("janeiro 2027", "set/2027", "2027-01"): parser existente.
  const withYear = parseMonthOrNull(cleaned);
  if (withYear) return formatPeriod(withYear);

  // Só o nome do mês: ocorrência mais próxima da base (empate → futuro).
  const bare = parseMonthOrNull(`${cleaned}/${base.getUTCFullYear()}`);
  if (!bare) return null;
  const baseIndex = base.getUTCFullYear() * 12 + base.getUTCMonth();
  let best: Date | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const year of [base.getUTCFullYear() - 1, base.getUTCFullYear(), base.getUTCFullYear() + 1]) {
    const distance = Math.abs(year * 12 + bare.getUTCMonth() - baseIndex);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = new Date(Date.UTC(year, bare.getUTCMonth(), 1));
    }
  }
  return best ? formatPeriod(best) : null;
}
