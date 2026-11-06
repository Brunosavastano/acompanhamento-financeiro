import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { BalanceReadModelOutput } from "@finance/shared-types";
import { buildReadContext, readBalanceScreens, type ReadContextPosition } from "./balance-read";

// O provedor nunca é chamado nos testes: o modelo de visão é um mock que devolve
// a resposta estruturada que quisermos.
const mocked = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@/server/ai", () => ({
  getVisionModel: () => mocked.model,
  aiCallDefaults: () => ({ maxRetries: 0 }),
}));

function modelReturning(output: BalanceReadModelOutput) {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      warnings: [],
    },
  });
  mocked.model = model;
  return model;
}

type Read = BalanceReadModelOutput["reads"][number];
function modelRead(partial: Partial<Read>): Read {
  return {
    imageIndex: 1,
    institution: "",
    accountLabel: null,
    holderName: null,
    kind: "cash",
    amountRaw: "",
    excerpt: "",
    confidence: 0.95,
    note: null,
    ...partial,
  };
}

const t0 = new Date("2026-11-01T10:00:00.000Z");
function position(id: string, person: "Bruno" | "Tatiane", accountId: string, account: string, category: ReadContextPosition["category"], createdAt = t0): ReadContextPosition {
  return { id, personId: person.toLowerCase(), accountId, category, createdAt, person: { name: person }, account: { name: account } };
}

const draftPositions = [
  position("p-nubank", "Bruno", "a-nubank", "Nubank", "cash"),
  position("p-vr", "Bruno", "a-vr", "VR", "benefit"),
  position("p-inv-b", "Bruno", "a-inv-b", "Investimentos", "investment"),
  position("p-caixa", "Tatiane", "a-caixa", "Caixa", "cash"),
  position("p-inv-t", "Tatiane", "a-inv-t", "Investimentos", "investment"),
];
const people = [
  { id: "bruno", name: "Bruno" },
  { id: "tatiane", name: "Tatiane" },
];
const png = { bytes: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png" };
const jpeg = { bytes: new Uint8Array([255, 216, 255]), mediaType: "image/jpeg" };

function context(previous: Array<{ accountId: string; amount: number }> = []) {
  return buildReadContext({
    positions: draftPositions,
    previousPositions: previous.map((item, index) => ({ id: `prev-${index}`, createdAt: t0, ...item })),
  });
}

async function read(output: BalanceReadModelOutput, options?: { images?: typeof png[]; previous?: Array<{ accountId: string; amount: number }>; personHintId?: string }) {
  const model = modelReturning(output);
  const { positions, previousAmounts } = context(options?.previous);
  const result = await readBalanceScreens({
    images: options?.images ?? [png],
    positions,
    people,
    personHintId: options?.personHintId ?? null,
    previousAmounts,
  });
  return { result, model };
}

describe("buildReadContext", () => {
  it("rotula e ordena as linhas como a tela, numerando contas com mais de uma linha", () => {
    const later = new Date("2026-11-01T11:00:00.000Z");
    const { positions } = buildReadContext({
      positions: [
        position("t2", "Tatiane", "a-caixa", "Caixa", "cash", later),
        position("b1", "Bruno", "a-nubank", "Nubank", "cash"),
        position("t1", "Tatiane", "a-caixa", "Caixa", "cash"),
      ],
      previousPositions: [],
    });
    expect(positions.map((item) => [item.id, item.label])).toEqual([
      ["b1", "Bruno — Nubank"],
      ["t1", "Tatiane — Caixa (1)"],
      ["t2", "Tatiane — Caixa (2)"],
    ]);
  });

  it("só compara com o mês anterior quando a conta tem uma linha nos dois meses", () => {
    const { previousAmounts } = buildReadContext({
      positions: [
        position("b1", "Bruno", "a-nubank", "Nubank", "cash"),
        position("t1", "Tatiane", "a-caixa", "Caixa", "cash"),
        position("t2", "Tatiane", "a-caixa", "Caixa", "cash"),
      ],
      previousPositions: [
        { id: "x1", accountId: "a-nubank", amount: "1500.25", createdAt: t0 },
        { id: "x2", accountId: "a-caixa", amount: "900", createdAt: t0 },
      ],
    });
    expect([...previousAmounts.entries()]).toEqual([["b1", 1500.25]]);
  });
});

describe("readBalanceScreens", () => {
  it("normaliza os valores no servidor e sugere a conta de cada saldo", async () => {
    const { result } = await read({
      reads: [
        modelRead({ institution: "Nubank", accountLabel: "Conta", kind: "cash", amountRaw: "R$ 3.456,78", excerpt: "Conta R$ 3.456,78" }),
        modelRead({ imageIndex: 2, institution: "Alelo", accountLabel: "Refeição", kind: "benefit", amountRaw: "R$ 512,30", excerpt: "Saldo Refeição R$ 512,30", confidence: 0.9 }),
      ],
      warnings: [],
    }, { images: [png, jpeg] });

    expect(result.warnings).toEqual([]);
    expect(result.reads).toHaveLength(2);
    expect(result.reads[0]).toMatchObject({
      imageIndex: 1,
      detectedInstitution: "Nubank",
      detectedLabel: "Conta",
      amountRaw: "R$ 3.456,78",
      amount: "3456.78",
      excerpt: "Conta R$ 3.456,78",
      positionId: "p-nubank",
      positionLabel: "Bruno — Nubank",
      matchReason: "name",
      flags: [],
    });
    expect(result.reads[1]).toMatchObject({ imageIndex: 2, amount: "512.30", positionId: "p-vr", positionLabel: "Bruno — VR", confidence: 0.9 });
  });

  it("entrega as imagens ao modelo na ordem, cada uma identificada como Print N", async () => {
    const { model } = await read({ reads: [modelRead({ institution: "Nubank", amountRaw: "R$ 1,00" })], warnings: [] }, { images: [png, jpeg] });
    expect(model.doGenerateCalls).toHaveLength(1);
    type Part = { type: string; text?: string; mediaType?: string };
    const prompt = model.doGenerateCalls[0].prompt as Array<{ content: unknown }>;
    const parts = prompt.flatMap((message) => (Array.isArray(message.content) ? (message.content as Part[]) : []));
    const texts = parts.filter((part) => part.type === "text").map((part) => part.text);
    expect(texts).toContain("Print 1:");
    expect(texts).toContain("Print 2:");
    const files = parts.filter((part) => part.type === "file").map((part) => part.mediaType);
    expect(files).toEqual(["image/png", "image/jpeg"]);
  });

  it("mantém visível o saldo que não dá para ler, sem inventar valor", async () => {
    const { result } = await read({
      reads: [modelRead({ institution: "Nubank", amountRaw: "R$ ••••", excerpt: "Saldo R$ ••••", confidence: 0.3, note: "valor oculto" })],
      warnings: [],
    });
    expect(result.reads[0]).toMatchObject({ amount: null, positionId: "p-nubank", note: "valor oculto" });
    expect(result.reads[0].flags).toEqual(expect.arrayContaining(["unparseable", "low_confidence"]));
  });

  it("sinaliza magnitude ambígua e saldo muito diferente do último fechamento", async () => {
    const { result } = await read(
      { reads: [modelRead({ institution: "Nubank", amountRaw: "R$ 345.678", kind: "cash" })], warnings: [] },
      { previous: [{ accountId: "a-nubank", amount: 3456.78 }] },
    );
    expect(result.reads[0]).toMatchObject({ amount: "345678.00", previousAmount: "3456.78" });
    expect(result.reads[0].flags).toEqual(["ambiguous_magnitude", "large_delta"]);
  });

  it("não alarma variação normal em relação ao mês anterior", async () => {
    const { result } = await read(
      { reads: [modelRead({ institution: "Nubank", amountRaw: "R$ 4.100,00" })], warnings: [] },
      { previous: [{ accountId: "a-nubank", amount: 3456.78 }] },
    );
    expect(result.reads[0].flags).toEqual([]);
  });

  it("devolve conta ambígua e conta desconhecida para a pessoa escolher", async () => {
    const { result } = await read({
      reads: [
        modelRead({ institution: "XP", accountLabel: "Patrimônio total", kind: "investment", amountRaw: "R$ 50.000,00" }),
        modelRead({ institution: "Banco Desconhecido", kind: "other", amountRaw: "R$ 10,00" }),
      ],
      warnings: [],
    });
    expect(result.reads[0]).toMatchObject({ positionId: null, positionLabel: null, flags: ["ambiguous_match"] });
    expect(result.reads[0].candidatePositionIds.sort()).toEqual(["p-inv-b", "p-inv-t"]);
    expect(result.reads[1]).toMatchObject({ positionId: null, amount: "10.00", flags: ["no_match"] });
  });

  it("aplica a pessoa escolhida no envio", async () => {
    const { result } = await read(
      { reads: [modelRead({ institution: "XP", accountLabel: "Patrimônio total", kind: "investment", amountRaw: "R$ 50.000,00" })], warnings: [] },
      { personHintId: "tatiane" },
    );
    expect(result.reads[0]).toMatchObject({ positionId: "p-inv-t", positionLabel: "Tatiane — Investimentos" });
  });

  it("avisa sobre prints sem nenhum saldo reconhecido e repassa os avisos do modelo", async () => {
    const { result } = await read(
      {
        reads: [modelRead({ imageIndex: 1, institution: "Nubank", amountRaw: "R$ 1,00" }), modelRead({ imageIndex: 7, institution: "Nubank", amountRaw: "R$ 2,00" })],
        warnings: ["o print 2 mostra só a fatura do cartão"],
      },
      { images: [png, jpeg] },
    );
    expect(result.reads.map((row) => row.imageIndex)).toEqual([1, null]);
    expect(result.warnings).toEqual(["o print 2 mostra só a fatura do cartão", "Nenhum saldo reconhecido no print 2."]);
  });

  it("avisa quando nada foi reconhecido", async () => {
    const { result } = await read({ reads: [], warnings: [] }, { images: [png, jpeg] });
    expect(result.reads).toEqual([]);
    expect(result.warnings).toEqual(["Nenhum saldo reconhecido nos prints enviados."]);
  });

  it("corta textos longos e limita a confiança entre 0 e 1", async () => {
    const { result } = await read({
      reads: [modelRead({ institution: "N".repeat(500), amountRaw: "R$ 1,00", excerpt: "x ".repeat(400), confidence: 7, note: "   " })],
      warnings: [],
    });
    expect(result.reads[0].detectedInstitution).toHaveLength(80);
    expect(result.reads[0].excerpt.length).toBeLessThanOrEqual(200);
    expect(result.reads[0].confidence).toBe(1);
    expect(result.reads[0].note).toBeNull();
  });
});
