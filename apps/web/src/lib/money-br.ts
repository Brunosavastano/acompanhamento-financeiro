/**
 * Parser de valores monetários em formato brasileiro para o caminho de IA.
 *
 * Diferente do `toNumber` do import de Excel, este NUNCA devolve 0 silencioso:
 * falhas retornam `{ ok: false }` para que o campo fique vazio (e apareça em
 * "não preenchidas") em vez de zerar um saldo. Valores cuja magnitude é ambígua
 * (sem centavos, ou já normalizados para ponto decimal pelo modelo) são parseados
 * como melhor-esforço mas marcados `exact: false`, para a revisão sinalizar e o
 * humano conferir contra o recorte do print.
 */

export type BrMoneyParse =
  | { ok: true; value: number; normalized: string; exact: boolean }
  | { ok: false; reason: "empty" | "no_digits" | "malformed" };

const CURRENCY_NOISE = /[R$\s  ]|BRL/gi;

function build(value: number, exact: boolean): BrMoneyParse {
  if (!Number.isFinite(value)) return { ok: false, reason: "malformed" };
  // normalized: string decimal com ponto, 2 casas — o que a API devolve ao cliente.
  return { ok: true, value, normalized: value.toFixed(2), exact };
}

export function parseBrMoney(raw: string | null | undefined): BrMoneyParse {
  if (raw === null || raw === undefined) return { ok: false, reason: "empty" };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  // Remove símbolos de moeda e espaços (inclusive NBSP / narrow NBSP).
  const cleaned = trimmed.replace(CURRENCY_NOISE, "");
  if (!/\d/.test(cleaned)) return { ok: false, reason: "no_digits" };

  // Só dígitos, ponto, vírgula e sinal são aceitos daqui em diante.
  if (!/^-?[\d.,]+$/.test(cleaned)) return { ok: false, reason: "malformed" };

  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  const sign = negative ? -1 : 1;

  const commas = (body.match(/,/g) || []).length;
  const dots = (body.match(/\./g) || []).length;

  // Múltiplas vírgulas: inválido ("1,2,3").
  if (commas > 1) return { ok: false, reason: "malformed" };

  // Caso padrão brasileiro: vírgula decimal com 1–2 casas, ponto = milhar.
  // Ex.: "1.234,56", "12,50", "286.420,18", "1.234,5".
  if (commas === 1) {
    const [intPart, decPart] = body.split(",");
    if (!/^\d{1,3}(\.\d{3})*$/.test(intPart) && !/^\d+$/.test(intPart)) return { ok: false, reason: "malformed" };
    if (!/^\d{1,2}$/.test(decPart)) return { ok: false, reason: "malformed" };
    const digits = intPart.replace(/\./g, "");
    const value = Number(`${digits}.${decPart.padEnd(2, "0")}`);
    return build(sign * value, true);
  }

  // Sem vírgula: precisamos decidir se ponto é milhar, decimal (modelo em inglês)
  // ou se é um inteiro ambíguo. Em todos esses casos a confiança é menor.
  if (dots === 0) {
    // Inteiro puro: "123456" — reais ou centavos? Ambíguo. Assume reais, marca inexato.
    if (!/^\d+$/.test(body)) return { ok: false, reason: "malformed" };
    return build(sign * Number(body), false);
  }

  // Grupos de milhar bem formados: "1.234.567" (>=2 grupos = inequívoco).
  if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    const groups = dots; // nº de pontos = nº de separadores de milhar
    const value = Number(body.replace(/\./g, ""));
    // "1.234" (1 grupo) é o clássico ambíguo; "1.234.567" (>=2) é seguro.
    return build(sign * value, groups >= 2);
  }

  // Ponto único com exatamente 2 casas: provável decimal em inglês ("1234.56").
  if (/^\d+\.\d{2}$/.test(body)) {
    return build(sign * Number(body), false);
  }

  return { ok: false, reason: "malformed" };
}

/** Formata um número como moeda pt-BR sem símbolo, para exibição na revisão. */
export function formatBrNumber(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
