import { describe, expect, it } from "vitest";
import { resolveInvoiceMonthLabel } from "./invoice-month";

describe("resolveInvoiceMonthLabel", () => {
  const base = "2026-08";

  it("resolve mês sem ano para a ocorrência mais próxima da base", () => {
    expect(resolveInvoiceMonthLabel("Agosto", base)).toBe("2026-08-01");
    expect(resolveInvoiceMonthLabel("Setembro", base)).toBe("2026-09-01");
    expect(resolveInvoiceMonthLabel("Dezembro", base)).toBe("2026-12-01");
    expect(resolveInvoiceMonthLabel("Janeiro", base)).toBe("2027-01-01");
  });

  it("resolve mês recém-passado para TRÁS, permitindo a flag before_base", () => {
    // Fatura fechada "Julho" num print de agosto: 2026-07, não 2027-07.
    expect(resolveInvoiceMonthLabel("Julho", base)).toBe("2026-07-01");
    expect(resolveInvoiceMonthLabel("mar", base)).toBe("2026-03-01");
    // Empate exato de 6 meses prefere o futuro.
    expect(resolveInvoiceMonthLabel("Fevereiro", base)).toBe("2027-02-01");
  });

  it("respeita ano explícito em formatos comuns de app de banco", () => {
    expect(resolveInvoiceMonthLabel("Janeiro de 2027", base)).toBe("2027-01-01");
    expect(resolveInvoiceMonthLabel("Fevereiro de 2027", base)).toBe("2027-02-01");
    expect(resolveInvoiceMonthLabel("set/2027", base)).toBe("2027-09-01");
    expect(resolveInvoiceMonthLabel("2027-04", base)).toBe("2027-04-01");
  });

  it("ignora ruído de rótulo e acentos", () => {
    expect(resolveInvoiceMonthLabel("Março de 2027", base)).toBe("2027-03-01");
    expect(resolveInvoiceMonthLabel("Fatura atual — Agosto", base)).toBe("2026-08-01");
  });

  it("retorna null para rótulos irreconhecíveis", () => {
    expect(resolveInvoiceMonthLabel("Histórico", base)).toBeNull();
    expect(resolveInvoiceMonthLabel("", base)).toBeNull();
    expect(resolveInvoiceMonthLabel("13/2027", base)).toBeNull();
  });
});
