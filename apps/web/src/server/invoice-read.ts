import { generateObject } from "ai";
import { invoiceReadModelSchema, type InvoiceReadFlag, type InvoiceReadResult, type InvoiceReadRow } from "@finance/shared-types";
import { formatPeriod } from "@/lib/date";
import { resolveInvoiceMonthLabel } from "@/lib/invoice-month";
import { parseBrMoney } from "@/lib/money-br";
import { aiCallDefaults, getVisionModel } from "@/server/ai";

const PROMPT = [
  "Você está lendo screenshots de um app de banco brasileiro com a lista de faturas do cartão de crédito",
  '(tela do tipo "Próximas faturas" / "Selecione uma fatura"), uma linha por mês.',
  "Extraia UMA entrada por linha de fatura visível, na ordem em que aparecem:",
  '- monthLabel: o rótulo do mês EXATAMENTE como exibido (ex.: "Setembro", "Janeiro de 2027").',
  '- kind: "current" se a linha estiver marcada como fatura atual/aberta; "future" se fatura futura;',
  '  "past" se for fatura passada/fechada/paga (ex.: aba "Histórico", rótulos "fechada", "paga"); senão "unknown".',
  '- amountRaw: o valor EXATAMENTE como exibido, com R$, pontos e vírgula (ex.: "R$ 7.772,28"). NÃO normalize, NÃO converta.',
  "- note: null, ou uma observação curta se algo estiver parcialmente encoberto/ilegível.",
  "Não invente linhas que não estão visíveis. Não some valores. Se um valor estiver cortado, reporte em note.",
  "Use warnings para avisos gerais (ex.: lista aparentemente truncada no fim da tela).",
].join("\n");

/**
 * Lê prints de "próximas faturas" e devolve linhas NORMALIZADAS NO SERVIDOR
 * (mês resolvido + valor parseado com parseBrMoney) e sinalizadas para revisão
 * humana. Nada é gravado aqui — o cliente decide o que salvar via /api/debts/bulk.
 */
export async function readInvoiceScreens(input: {
  images: { bytes: Uint8Array; mediaType: string }[];
  baseMonth: string; // "YYYY-MM" ou "YYYY-MM-01"
}): Promise<InvoiceReadResult> {
  const model = getVisionModel();
  const { object } = await generateObject({
    model,
    schema: invoiceReadModelSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: PROMPT },
          ...input.images.map((image) => ({ type: "image" as const, image: image.bytes, mediaType: image.mediaType })),
        ],
      },
    ],
    ...aiCallDefaults(),
  });

  const baseKey = formatPeriod(`${input.baseMonth.slice(0, 7)}-01`);
  const rows: InvoiceReadRow[] = object.rows.map((row) => {
    const flags: InvoiceReadFlag[] = [];
    const paymentMonth = resolveInvoiceMonthLabel(row.monthLabel, baseKey);
    if (!paymentMonth) flags.push("month_unresolved");
    if (paymentMonth && paymentMonth < baseKey) flags.push("before_base");
    // Fatura marcada como passada/fechada pelo modelo: sinaliza mesmo que o
    // mês resolvido caia à frente da base (ex.: rótulo ambíguo na virada de ano).
    if (row.kind === "past" && !flags.includes("before_base")) flags.push("past_invoice");

    const parsed = parseBrMoney(row.amountRaw);
    if (!parsed.ok) flags.push("unparseable");
    else if (!parsed.exact) flags.push("ambiguous_magnitude");

    return {
      monthLabel: row.monthLabel,
      paymentMonth,
      currentInvoice: row.kind === "current",
      amount: parsed.ok ? parsed.normalized : null,
      flags,
      note: row.note,
    };
  });

  return { rows, warnings: object.warnings };
}
