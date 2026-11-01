import { describe, expect, it } from "vitest";
import { formatLooseNumber, parseLooseNumber } from "./number-br";

describe("parseLooseNumber", () => {
  it("entende milhar e decimal no formato brasileiro", () => {
    expect(parseLooseNumber("1.000.000")).toBe(1000000);
    expect(parseLooseNumber("500.000,00")).toBe(500000);
    expect(parseLooseNumber("1.500")).toBe(1500);
    expect(parseLooseNumber("0,1")).toBe(0.1);
    expect(parseLooseNumber("R$ 30.000")).toBe(30000);
  });

  it("aceita decimal com ponto e números puros", () => {
    expect(parseLooseNumber("0.4")).toBe(0.4);
    // primeiro grupo "0" nunca é milhar (valores canônicos como o Decimal 0.125)
    expect(parseLooseNumber("0.125")).toBe(0.125);
    expect(parseLooseNumber("-0.025")).toBe(-0.025);
    expect(parseLooseNumber("1234.56")).toBe(1234.56);
    expect(parseLooseNumber("6")).toBe(6);
    expect(parseLooseNumber(4.96)).toBe(4.96);
    expect(parseLooseNumber("-0,2880")).toBeCloseTo(-0.288, 4);
  });

  it("converte porcentagem em decimal exato", () => {
    expect(parseLooseNumber("10%")).toBe(0.1);
    expect(parseLooseNumber("2,5%")).toBe(0.025);
    // em ponto flutuante 70 * 0.01 = 0.7000000000000001
    expect(parseLooseNumber("70%")).toBe(0.7);
    expect(parseLooseNumber("57%")).toBe(0.57);
  });

  it("relê sem ambiguidade os números que o app grava em texto", () => {
    for (const value of [4.125, 1.125, 16500, 0.4317718719, -1.125, 275223.18]) {
      expect(parseLooseNumber(formatLooseNumber(value))).toBe(value);
    }
  });

  it("devolve null para texto livre ou formatos inválidos", () => {
    expect(parseLooseNumber("Estudando")).toBeNull();
    expect(parseLooseNumber("Level II ✓")).toBeNull();
    expect(parseLooseNumber("")).toBeNull();
    expect(parseLooseNumber(null)).toBeNull();
    expect(parseLooseNumber("1,2,3")).toBeNull();
    expect(parseLooseNumber("12.34.5")).toBeNull();
    expect(parseLooseNumber(Number.NaN)).toBeNull();
  });
});
