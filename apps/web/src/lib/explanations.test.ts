import { describe, expect, it } from "vitest";
import { explain, explainAlerts, nominalDebtNote } from "./explanations";
import { commitmentHealth, debtHealth, formatTargetMonths, reserveHealth, savingsHealth } from "./health";

const nbsp = (text: string) => text.replace(/ /g, " ");

describe("explicações (ⓘ)", () => {
  it("explains what each card means in plain words", () => {
    expect(explain("dividas").paragraphs.join(" ")).toContain("descontada pela Selic do fechamento");
    expect(explain("caixa").paragraphs.join(" ")).toContain("VR/VA");
    expect(explain("investimentos").paragraphs.join(" ")).toContain("cashback");
    expect(explain("sobraPlanejada").paragraphs[0]).toMatch(/^Vem do orçamento, não do realizado/);
  });

  it("adds the page's own numbers after the fixed text", () => {
    const debts = explain("dividas", [nominalDebtNote(50345.59), null]);
    expect(debts.paragraphs.map(nbsp).at(-1)).toBe("Sem o desconto, as parcelas somam R$ 50.346.");
    expect(nominalDebtNote(0)).toBeNull();
    expect(explain("caixa", [])).toBe(explain("caixa"));
  });

  it("lists the alert rules from the same limits the alerts use", () => {
    const family = explainAlerts(true).items?.map(nbsp) ?? [];
    expect(family).toContain("fatura do mês 25% ou mais acima da média de 12 meses (e pelo menos R$ 500 a mais);");
    expect(family).toContain("total a pagar do cartão subindo há 3 meses ou mais;");
    expect(family).toContain("conta no vermelho, ou que zerou depois de ter pelo menos R$ 100;");
    expect(family).toContain("parcelas já lançadas que, num dos próximos 3 meses, somam 50% ou mais da fatura média;");
    // Reserva e fechamento são da família: a página da pessoa não lista esses avisos.
    const person = explainAlerts(false).items ?? [];
    expect(family).toHaveLength(7);
    expect(person).toHaveLength(5);
    expect(person.some((item) => item.includes("reserva") || item.includes("fechado"))).toBe(false);
  });
});

describe("faixas da saúde financeira", () => {
  it("keeps the badges of the overview cards", () => {
    expect([1, 0.75, 0.4, 0.39].map((ratio) => reserveHealth(ratio).badge)).toEqual(["Meta atingida", "Quase lá", "Em construção", "Atenção"]);
    expect([0.05, 0.15, 0.16].map((value) => debtHealth(value).badge)).toEqual(["Sob controle", "Exige atenção", "Alto"]);
    expect([0.2, 0.1, 0, -0.01].map((value) => savingsHealth(value).badge)).toEqual(["Ótimo ritmo", "Bom ritmo", "Ritmo baixo", "No vermelho"]);
    expect([0.6, 0.85, 0.86].map((value) => commitmentHealth(value).badge)).toEqual(["Confortável", "Atenção", "Crítico"]);
  });

  it("shows the reserve goal without hiding decimals", () => {
    expect(formatTargetMonths(6)).toBe("6");
    expect(formatTargetMonths(4.5)).toBe("4,5");
  });
});
