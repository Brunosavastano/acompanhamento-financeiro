import { generateObject } from "ai";
import { balanceReadModelSchema, type BalanceReadFlag, type BalanceReadResult, type BalanceReadRow } from "@finance/shared-types";
import { matchBalanceReads, type MatchCategory, type MatchPerson, type MatchPosition } from "@/lib/balance-match";
import { parseBrMoney } from "@/lib/money-br";
import { aiCallDefaults, getVisionModel } from "@/server/ai";

const PROMPT = [
  "Você está lendo screenshots de apps de bancos, corretoras e cartões-benefício brasileiros para conferir os saldos",
  "do fechamento do mês de uma família. Cada print vem precedido de \"Print N:\" (N = 1, 2, ...).",
  "Extraia UMA entrada para cada saldo visível de conta, investimento, benefício (vale-refeição/alimentação) ou cashback:",
  "- imageIndex: o número N do print onde o saldo aparece.",
  '- institution: o banco/app como aparece na tela (nome ou logo), ex.: "Nubank", "Itaú", "XP", "Alelo". Use "" se não der para saber.',
  '- accountLabel: o nome do saldo como aparece, ex.: "Conta", "Saldo disponível", "Caixinhas", "Refeição", "Patrimônio total"; ou null.',
  '- holderName: o nome do titular SE estiver escrito na tela (ex.: em "Olá, Tatiane" → "Tatiane"); senão null. Não adivinhe.',
  '- kind: "cash" (conta corrente, conta de pagamento, saldo em conta), "benefit" (vale-refeição, vale-alimentação e outros benefícios),',
  '  "investment" (investimentos, patrimônio em corretora, poupança, CDB, caixinhas/cofrinhos), "cashback" (saldo de cashback) ou "other".',
  '- amountRaw: o valor EXATAMENTE como exibido, com R$, sinal, pontos e vírgula (ex.: "R$ 1.234,56", "-R$ 50,00").',
  '  NÃO normalize, NÃO converta, NÃO arredonde. Se o valor estiver oculto (ex.: "R$ ••••"), copie como está.',
  '- excerpt: o trecho de texto ao redor do valor, como aparece na tela (ex.: "Saldo em conta R$ 1.234,56").',
  "- confidence: de 0 a 1, o quanto você tem certeza de que leu o valor certo (nitidez, cortes, sobreposições).",
  '- note: null, ou uma observação curta (ex.: "valor parcialmente cortado").',
  "NÃO extraia: fatura, limite ou gastos de cartão de crédito; empréstimos e financiamentos; lançamentos do extrato;",
  "rendimentos, variações ou percentuais. Não invente saldos que não estão visíveis e não some saldos diferentes.",
  'Use warnings para avisos gerais (ex.: "o print 3 mostra só a fatura do cartão").',
  "Escreva note e warnings em português do Brasil.",
].join("\n");

/** Abaixo disso a leitura do valor é tratada como incerta na revisão. */
export const LOW_CONFIDENCE = 0.6;
/** Saldo 10x maior ou menor que o do último fechamento: típico de vírgula/milhar trocados. */
const LARGE_DELTA_FACTOR = 10;
/** Contas pequenas oscilam muito em proporção; não vale alarmar abaixo disso. */
const LARGE_DELTA_MIN_PREVIOUS = 100;

export type ReadablePosition = MatchPosition & { label: string };

export type ReadContextPosition = {
  id: string;
  personId: string;
  accountId: string | null;
  category: MatchCategory;
  createdAt: Date | string;
  person: { name: string };
  account: { name: string } | null;
};

export type PreviousPosition = {
  id: string;
  accountId: string | null;
  amount: unknown;
  createdAt: Date | string;
};

const categoryLabels: Record<MatchCategory, string> = {
  cash: "Caixa",
  benefit: "Benefício",
  investment: "Investimento",
  cashback: "Cashback",
};

function time(value: Date | string) {
  return new Date(value).getTime();
}

function byLineOrder(a: { createdAt: Date | string; id: string }, b: { createdAt: Date | string; id: string }) {
  return time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Monta, a partir das linhas do rascunho, o inventário que o casamento usa
 * (com o mesmo rótulo e a mesma ordem da tela) e o saldo comparável do último
 * fechamento — só para contas com uma linha nos dois meses, onde a comparação
 * é inequívoca.
 */
export function buildReadContext(input: { positions: ReadContextPosition[]; previousPositions: PreviousPosition[] }): {
  positions: ReadablePosition[];
  previousAmounts: Map<string, number>;
} {
  const linesPerAccount = new Map<string, ReadContextPosition[]>();
  for (const position of [...input.positions].sort(byLineOrder)) {
    if (!position.accountId) continue;
    linesPerAccount.set(position.accountId, [...(linesPerAccount.get(position.accountId) ?? []), position]);
  }

  const accountName = (position: ReadContextPosition) => position.account?.name ?? categoryLabels[position.category];
  const positions = [...input.positions]
    .sort(
      (a, b) =>
        a.person.name.localeCompare(b.person.name, "pt-BR") || accountName(a).localeCompare(accountName(b), "pt-BR") || byLineOrder(a, b),
    )
    .map((position) => {
      const lines = position.accountId ? linesPerAccount.get(position.accountId) ?? [] : [];
      const suffix = lines.length > 1 ? ` (${lines.indexOf(position) + 1})` : "";
      return {
        id: position.id,
        personId: position.personId,
        personName: position.person.name,
        accountId: position.accountId,
        accountName: accountName(position),
        category: position.category,
        label: `${position.person.name} — ${accountName(position)}${suffix}`,
      };
    });

  const previousLines = new Map<string, PreviousPosition[]>();
  for (const position of input.previousPositions) {
    if (!position.accountId) continue;
    previousLines.set(position.accountId, [...(previousLines.get(position.accountId) ?? []), position]);
  }
  const previousAmounts = new Map<string, number>();
  for (const [accountId, lines] of linesPerAccount) {
    const before = previousLines.get(accountId);
    if (lines.length !== 1 || before?.length !== 1) continue;
    const amount = Number(before[0].amount);
    if (Number.isFinite(amount)) previousAmounts.set(lines[0].id, amount);
  }

  return { positions, previousAmounts };
}

function clip(value: string | null | undefined, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clipOrNull(value: string | null | undefined, max: number): string | null {
  const clipped = clip(value, max);
  return clipped === "" ? null : clipped;
}

function isLargeDelta(value: number, previous: number) {
  if (Math.abs(previous) < LARGE_DELTA_MIN_PREVIOUS) return false;
  const ratio = value / previous;
  return ratio >= LARGE_DELTA_FACTOR || ratio <= 1 / LARGE_DELTA_FACTOR;
}

/**
 * Lê prints de saldos e devolve, para REVISÃO HUMANA, cada saldo com o valor
 * normalizado no servidor (parseBrMoney) e a linha do rascunho sugerida.
 * Nada é gravado aqui: o resultado só pré-preenche campos no navegador, e o
 * único gravador continua sendo o botão "Salvar e revisar".
 */
export async function readBalanceScreens(input: {
  images: { bytes: Uint8Array; mediaType: string }[];
  positions: ReadablePosition[];
  people: MatchPerson[];
  personHintId: string | null;
  previousAmounts: Map<string, number>;
}): Promise<BalanceReadResult> {
  const model = getVisionModel();
  const { object } = await generateObject({
    model,
    schema: balanceReadModelSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: PROMPT },
          ...input.images.flatMap((image, index) => [
            { type: "text" as const, text: `Print ${index + 1}:` },
            // Parte "file" com mediaType image/*: o formato atual do AI SDK v7
            // (a parte "image" usada no leitor de faturas está obsoleta).
            { type: "file" as const, data: image.bytes, mediaType: image.mediaType },
          ]),
        ],
      },
    ],
    ...aiCallDefaults({ images: input.images.length }),
  });

  const reads = object.reads.map((read) => {
    const index = typeof read.imageIndex === "number" ? Math.round(read.imageIndex) : NaN;
    return {
      imageIndex: index >= 1 && index <= input.images.length ? index : null,
      institution: clip(read.institution, 80),
      label: clipOrNull(read.accountLabel, 80),
      holder: clipOrNull(read.holderName, 80),
      kind: read.kind,
      amountRaw: clip(read.amountRaw, 40),
      excerpt: clip(read.excerpt, 200),
      confidence: Number.isFinite(read.confidence) ? Math.min(1, Math.max(0, read.confidence)) : 0,
      note: clipOrNull(read.note, 200),
    };
  });

  const matches = matchBalanceReads(reads, {
    positions: input.positions,
    people: input.people,
    personHintId: input.personHintId,
  });
  const labels = new Map(input.positions.map((position) => [position.id, position.label]));

  const rows: BalanceReadRow[] = reads.map((read, index) => {
    const match = matches[index];
    const flags: BalanceReadFlag[] = [];
    const parsed = parseBrMoney(read.amountRaw);
    if (!parsed.ok) flags.push("unparseable");
    else if (!parsed.exact) flags.push("ambiguous_magnitude");
    if (read.confidence < LOW_CONFIDENCE) flags.push("low_confidence");
    const previous = match.positionId ? input.previousAmounts.get(match.positionId) : undefined;
    if (parsed.ok && previous !== undefined && isLargeDelta(parsed.value, previous)) flags.push("large_delta");
    flags.push(...match.flags);

    return {
      imageIndex: read.imageIndex,
      detectedInstitution: read.institution,
      detectedLabel: read.label,
      detectedHolder: read.holder,
      kind: read.kind,
      excerpt: read.excerpt,
      amountRaw: read.amountRaw,
      amount: parsed.ok ? parsed.normalized : null,
      confidence: read.confidence,
      positionId: match.positionId,
      positionLabel: match.positionId ? labels.get(match.positionId) ?? null : null,
      matchReason: match.reason,
      candidatePositionIds: match.candidatePositionIds,
      previousAmount: previous === undefined ? null : previous.toFixed(2),
      flags,
      note: read.note,
    };
  });

  // Nada some em silêncio: print sem nenhum saldo reconhecido vira aviso.
  const warnings = object.warnings.map((warning) => clip(warning, 200)).filter(Boolean);
  if (rows.length === 0) {
    warnings.push(input.images.length === 1 ? "Nenhum saldo reconhecido no print." : "Nenhum saldo reconhecido nos prints enviados.");
  } else if (rows.some((row) => row.imageIndex !== null)) {
    const seen = new Set(rows.map((row) => row.imageIndex));
    for (let index = 1; index <= input.images.length; index += 1) {
      if (!seen.has(index)) warnings.push(`Nenhum saldo reconhecido no print ${index}.`);
    }
  }

  return { reads: rows, warnings };
}
