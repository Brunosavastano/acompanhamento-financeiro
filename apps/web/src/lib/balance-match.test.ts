import { describe, expect, it } from "vitest";
import { matchBalanceReads, nameTokens, resolveHolder, type MatchInput, type MatchPosition } from "./balance-match";

const people = [
  { id: "bruno", name: "Bruno" },
  { id: "tatiane", name: "Tatiane" },
];

function line(id: string, personId: "bruno" | "tatiane", accountId: string, accountName: string, category: MatchPosition["category"]): MatchPosition {
  return { id, personId, personName: personId === "bruno" ? "Bruno" : "Tatiane", accountId, accountName, category };
}

// Mesmas contas da família no seed e na planilha.
const positions: MatchPosition[] = [
  line("p-nubank", "bruno", "a-nubank", "Nubank", "cash"),
  line("p-vr", "bruno", "a-vr", "VR", "benefit"),
  line("p-va", "bruno", "a-va", "VA", "benefit"),
  line("p-inv-b", "bruno", "a-inv-b", "Investimentos", "investment"),
  line("p-cashback", "bruno", "a-cashback", "Cashback", "cashback"),
  line("p-caixa", "tatiane", "a-caixa", "Caixa", "cash"),
  line("p-inv-t", "tatiane", "a-inv-t", "Investimentos", "investment"),
];

function read(partial: Partial<MatchInput>): MatchInput {
  return { institution: "", label: null, holder: null, kind: "other", ...partial };
}

function matchOne(input: Partial<MatchInput>, personHintId: string | null = null, pool = positions) {
  return matchBalanceReads([read(input)], { positions: pool, people, personHintId })[0];
}

describe("nameTokens", () => {
  it("ignora acento, caixa e palavras genéricas de tela de banco", () => {
    expect(nameTokens("Saldo disponível na conta")).toEqual([]);
    expect(nameTokens("ITAÚ Unibanco")).toEqual(["itau", "unibanco"]);
    expect(nameTokens("Caixa Econômica Federal")).toContain("caixa");
  });

  it("aplica apelidos comuns e o plural simples", () => {
    expect(nameTokens("Nu")).toEqual(["nubank"]);
    expect(nameTokens("Vale-Refeição")).toEqual(["vr"]);
    expect(nameTokens("Ticket Restaurante")).toEqual(["ticket", "vr"]);
    expect(nameTokens("Alimentação")).toEqual(["va"]);
    expect(nameTokens("Patrimônio total")).toEqual(["investimento"]);
    expect(nameTokens("Investimentos")).toEqual(["investimento"]);
    // "Caixinhas" (Nubank) não pode virar a conta "Caixa".
    expect(nameTokens("Caixinhas")).toEqual(["caixinha"]);
    // "Mercado Pago" não é vale-alimentação.
    expect(nameTokens("Mercado Pago")).not.toContain("va");
  });
});

describe("resolveHolder", () => {
  it("casa o titular pelo primeiro nome, mesmo dentro de uma saudação", () => {
    expect(resolveHolder("Olá, Tatiane", people)).toEqual({ personId: "tatiane", unmatched: false });
    expect(resolveHolder("BRUNO M SAVASTANO", people)).toEqual({ personId: "bruno", unmatched: false });
  });

  it("sinaliza titular visível que não é da família, sem adivinhar", () => {
    expect(resolveHolder("Maria Souza", people)).toEqual({ personId: null, unmatched: true });
    expect(resolveHolder(null, people)).toEqual({ personId: null, unmatched: false });
  });
});

describe("matchBalanceReads", () => {
  it("casa pelo nome do banco, inclusive por apelido", () => {
    expect(matchOne({ institution: "Nubank", label: "Conta", kind: "cash" })).toMatchObject({ positionId: "p-nubank", reason: "name", flags: [] });
    expect(matchOne({ institution: "Nu", kind: "cash" })).toMatchObject({ positionId: "p-nubank", reason: "name" });
  });

  it("casa benefícios pelo tipo de vale (refeição → VR, alimentação → VA)", () => {
    expect(matchOne({ institution: "Alelo", label: "Refeição", kind: "benefit" })).toMatchObject({ positionId: "p-vr", reason: "name" });
    expect(matchOne({ institution: "Caju", label: "Alimentação", kind: "benefit" })).toMatchObject({ positionId: "p-va", reason: "name" });
  });

  it("não escolhe sozinho entre contas de mesmo nome de pessoas diferentes", () => {
    const result = matchOne({ institution: "XP", label: "Patrimônio total", kind: "investment" });
    expect(result.positionId).toBeNull();
    expect(result.flags).toEqual(["ambiguous_match"]);
    expect(result.candidatePositionIds.sort()).toEqual(["p-inv-b", "p-inv-t"]);
  });

  it("usa o titular visível no print para desempatar a pessoa", () => {
    const result = matchOne({ institution: "XP", label: "Patrimônio total", holder: "Olá, Tatiane", kind: "investment" });
    expect(result).toMatchObject({ positionId: "p-inv-t", reason: "name", personId: "tatiane" });
  });

  it("usa a pessoa escolhida no envio quando o print não mostra o titular", () => {
    const result = matchOne({ institution: "XP", label: "Patrimônio total", kind: "investment" }, "bruno");
    expect(result).toMatchObject({ positionId: "p-inv-b", personId: "bruno" });
  });

  it("o titular escrito no print vence a pessoa escolhida no envio", () => {
    const result = matchOne({ institution: "BTG", label: "Investimentos", holder: "Tatiane", kind: "investment" }, "bruno");
    expect(result).toMatchObject({ positionId: "p-inv-t", personId: "tatiane" });
  });

  it("sem nome reconhecível, casa pelo tipo só quando há uma conta desse tipo — e marca como fraco", () => {
    const tatiane = matchOne({ institution: "Itaú", label: "Saldo em conta", kind: "cash" }, "tatiane");
    expect(tatiane).toMatchObject({ positionId: "p-caixa", reason: "category", flags: ["weak_match"] });

    const anyone = matchOne({ institution: "Itaú", label: "Saldo em conta", kind: "cash" });
    expect(anyone.positionId).toBeNull();
    expect(anyone.flags).toEqual(["ambiguous_match"]);
    expect(anyone.candidatePositionIds.sort()).toEqual(["p-caixa", "p-nubank"]);
  });

  it("devolve leitura sem conta visível como no_match, sem descartar", () => {
    const result = matchOne({ institution: "Banco Desconhecido", kind: "other" });
    expect(result).toMatchObject({ positionId: null, reason: null, candidatePositionIds: [], flags: ["no_match"] });
  });

  it("avisa quando o titular não é da família e segue sem pessoa", () => {
    const result = matchOne({ institution: "Nubank", holder: "Maria", kind: "cash" });
    expect(result).toMatchObject({ positionId: "p-nubank", personId: null });
    expect(result.flags).toEqual(["holder_unmatched"]);
  });

  it("aponta tipo divergente quando o nome casa mas o saldo parece de outro tipo", () => {
    const result = matchOne({ institution: "Nubank", label: "Caixinhas", kind: "investment" });
    expect(result).toMatchObject({ positionId: "p-nubank", reason: "name", flags: ["kind_mismatch"] });
  });

  it("prefere a conta mais coberta pelo nome lido", () => {
    const pool = [...positions, line("p-caixinhas", "bruno", "a-caixinhas", "Nubank Caixinhas", "investment")];
    expect(matchOne({ institution: "Nubank", label: "Caixinhas", kind: "investment" }, null, pool)).toMatchObject({ positionId: "p-caixinhas" });
    expect(matchOne({ institution: "Nubank", label: "Conta", kind: "cash" }, null, pool)).toMatchObject({ positionId: "p-nubank" });
  });

  it("distribui leituras entre as linhas da mesma conta e não sobrescreve a excedente", () => {
    const pool = [line("c1", "tatiane", "a-caixa", "Caixa", "cash"), line("c2", "tatiane", "a-caixa", "Caixa", "cash")];
    const results = matchBalanceReads(
      [
        read({ institution: "Caixa Econômica Federal", kind: "cash" }),
        read({ institution: "CAIXA", label: "Poupança", kind: "investment" }),
        read({ institution: "Caixa", kind: "cash" }),
      ],
      { positions: pool, people, personHintId: null },
    );
    expect(results.map((result) => result.positionId)).toEqual(["c1", "c2", null]);
    expect(results[2].flags).toEqual(["duplicate_target"]);
    expect(results[2].candidatePositionIds).toEqual(["c1", "c2"]);
  });

  it("segundo saldo do mesmo banco (Conta + Caixinhas) não toma a conta já sugerida", () => {
    const results = matchBalanceReads(
      [
        read({ institution: "Nubank", label: "Conta", holder: "Olá, Bruno", kind: "cash" }),
        read({ institution: "Nubank", label: "Caixinhas", holder: "Olá, Bruno", kind: "investment" }),
      ],
      { positions, people, personHintId: null },
    );
    expect(results[0]).toMatchObject({ positionId: "p-nubank", flags: [] });
    // Sem conta sugerida, o aviso é só o de conta ocupada (tipo divergente não se aplica).
    expect(results[1]).toMatchObject({ positionId: null, candidatePositionIds: ["p-nubank"], flags: ["duplicate_target"] });
  });

  it("ignora pessoa escolhida que não é da família", () => {
    const result = matchOne({ institution: "Nubank", kind: "cash" }, "intrusa");
    expect(result).toMatchObject({ positionId: "p-nubank", personId: null });
  });
});
