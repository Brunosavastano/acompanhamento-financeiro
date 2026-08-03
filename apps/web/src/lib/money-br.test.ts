import { describe, expect, it } from "vitest";
import { parseBrMoney } from "./money-br";

describe("parseBrMoney", () => {
  it("parseia o formato brasileiro padrão com confiança", () => {
    const cases: Array<[string, number]> = [
      ["R$ 1.234,56", 1234.56],
      ["12.345,67", 12345.67],
      ["R$ 0,00", 0],
      ["286.420,18", 286420.18],
      ["1.234.567,89", 1234567.89],
      ["12,50", 12.5],
      ["R$ 1.234,5", 1234.5],
      ["-50,00", -50],
    ];
    for (const [raw, expected] of cases) {
      const result = parseBrMoney(raw);
      expect(result.ok, `${raw} deveria parsear`).toBe(true);
      if (result.ok) {
        expect(result.value, `${raw}`).toBeCloseTo(expected, 2);
        expect(result.exact, `${raw} deveria ser exato`).toBe(true);
      }
    }
  });

  it("aceita NBSP e ruído de moeda", () => {
    const result = parseBrMoney("R$ 1.000,00");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(1000, 2);
  });

  it("trata milhar de múltiplos grupos como inequívoco", () => {
    const result = parseBrMoney("1.234.567");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1234567);
      expect(result.exact).toBe(true);
    }
  });

  it("marca casos ambíguos como inexatos (mas ainda parseia)", () => {
    for (const raw of ["1.234", "123456", "1234.56", "R$ 5"]) {
      const result = parseBrMoney(raw);
      expect(result.ok, `${raw}`).toBe(true);
      if (result.ok) expect(result.exact, `${raw} deveria ser inexato`).toBe(false);
    }
  });

  it("interpreta ponto-único-2-casas como decimal em inglês, não milhar", () => {
    const result = parseBrMoney("1234.56");
    expect(result.ok).toBe(true);
    // 1234.56, NÃO 123456 (o erro de 100x que queremos evitar)
    if (result.ok) expect(result.value).toBeCloseTo(1234.56, 2);
  });

  it("falha explicitamente (nunca zero silencioso) em entrada inválida", () => {
    for (const raw of ["", "   ", "abc", "R$", "1,2,3", null, undefined]) {
      const result = parseBrMoney(raw as string);
      expect(result.ok, `${JSON.stringify(raw)} deveria falhar`).toBe(false);
    }
  });

  it("nunca devolve 0 para um valor não-vazio inválido", () => {
    const result = parseBrMoney("xyz");
    expect(result.ok).toBe(false);
    // não há .value quando ok:false — o chamador deixa o campo vazio
    expect("value" in result).toBe(false);
  });
});
