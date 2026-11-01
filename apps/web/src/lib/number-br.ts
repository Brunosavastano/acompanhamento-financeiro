import Decimal from "decimal.js";

/**
 * Número a partir de texto digitado por gente (pt-BR ou não), ou null.
 *
 * Usado para alvos e valores atuais de metas, onde o usuário escreve
 * "1.000.000", "500.000,00", "R$ 5 mil" não é aceito (devolve null), "0,1",
 * "0.4" ou "10%". Nunca devolve NaN e nunca lança.
 */
export function parseLooseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  let text = String(value).trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (!text) return null;

  let percentage = false;
  if (text.endsWith("%")) {
    percentage = true;
    text = text.slice(0, -1);
  }
  if (!/^-?[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;
  let normalized: string;
  if (commas > 1) return null;
  if (commas === 1) {
    // vírgula decimal; pontos (se houver) são milhar: "1.234,56", "0,1"
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (dots > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(text)) {
    // só pontos em grupos de 3: milhar pt-BR ("1.000.000", "1.500"). Um
    // primeiro grupo "0" nunca é milhar: "0.125" é decimal.
    if (!/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(text)) return null;
    normalized = text.replace(/\./g, "");
  } else {
    // ponto único com 1–2 ou 4+ casas, ou "0.xxx": decimal ("0.4", "0.125", "1234.56")
    normalized = text;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  // "%" em decimal exato: 70% = 0,7 (em ponto flutuante daria 0,7000000000000001)
  return percentage ? new Decimal(normalized).div(100).toNumber() : parsed;
}

/**
 * Número gravado pelo próprio app em campos de texto (valor atual de metas):
 * vírgula decimal, sem milhar — relido sem ambiguidade por parseLooseNumber
 * ("4.125" seria lido como milhar; "4,125" não).
 */
export function formatLooseNumber(value: number): string {
  // String() usa notação científica para valores muito pequenos/grandes ("1e-7").
  const plain = /e/i.test(String(value)) ? value.toFixed(10).replace(/\.?0+$/, "") : String(value);
  return plain.replace(".", ",");
}
