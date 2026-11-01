import { describe, expect, it } from "vitest";
import { accountSeries, combinedLabel, combinedValue, debtRows, outlookRows, summaryRows, type EvolutionData } from "./evolution";

const data: EvolutionData = {
  people: [
    { id: "b", name: "Bruno" },
    { id: "t", name: "Tatiane" },
  ],
  accounts: [
    { key: "nubank", personId: "b", name: "Nubank", category: "cash", group: "cash" },
    { key: "vr", personId: "b", name: "VR", category: "benefit", group: "cash" },
    { key: "xp", personId: "b", name: "XP", category: "investment", group: "investments" },
    { key: "cashback", personId: "b", name: "Cashback", category: "cashback", group: "investments" },
    { key: "caixa-t", personId: "t", name: "Caixa", category: "cash", group: "cash" },
    { key: "antiga", personId: "t", name: "Conta antiga", category: "investment", group: "investments" },
  ],
  months: [
    { month: "2026-09", balances: { nubank: 1000, vr: 200, xp: 5000, cashback: 50, "caixa-t": 300, antiga: 0 }, debtPv: { b: 800, t: 100.004 }, debtPvTotal: 900 },
    { month: "2026-11", balances: { nubank: 1500, vr: 100, xp: 5500, cashback: 0, "caixa-t": 400 }, debtPv: { b: 700 }, debtPvTotal: 700 },
  ],
  debt: {
    months: [
      {
        month: "2026-09",
        byPerson: {
          b: { outstanding: 2000, invoice: 1000, invoiceProjected: false, averageInvoice: 1000, paidSincePrevious: null, newSincePrevious: null },
          t: { outstanding: 300, invoice: 200, invoiceProjected: false, averageInvoice: 200, paidSincePrevious: null, newSincePrevious: null },
        },
      },
      {
        month: "2026-11",
        byPerson: {
          b: { outstanding: 1700, invoice: 900, invoiceProjected: false, averageInvoice: 950, paidSincePrevious: 1600, newSincePrevious: 1300 },
          t: { outstanding: null, invoice: null, invoiceProjected: false, averageInvoice: 200, paidSincePrevious: null, newSincePrevious: null },
        },
      },
    ],
    outlook: {
      asOfMonth: "2026-11",
      byPerson: {
        b: { baseMonth: "2026-11", schedule: [{ month: "2026-11", amount: 900 }, { month: "2026-12", amount: 500 }, { month: "2027-01", amount: 300 }] },
        t: { baseMonth: "2026-09", schedule: [{ month: "2026-12", amount: 100 }] },
      },
    },
  },
};

describe("evolution series", () => {
  it("adds VR/VA to cash and cashback to investments, per person and for the family", () => {
    const bruno = summaryRows(data, "b");
    expect(bruno[0]).toEqual({ month: "2026-09", caixa: 1200, investimentos: 5050, dividas: 800, patrimonio: 5450 });
    const family = summaryRows(data, "familia");
    // Família usa o total arredondado uma vez só (bate com o card de patrimônio).
    expect(family[0]).toEqual({ month: "2026-09", caixa: 1500, investimentos: 5050, dividas: 900, patrimonio: 5650 });
    expect(family[1].patrimonio).toBe(1500 + 100 + 5500 + 400 - 700);
  });

  it("sums selected components into one line, debts subtracting", () => {
    const [row] = summaryRows(data, "b");
    expect(combinedValue(row, ["caixa", "investimentos"])).toBe(6250);
    expect(combinedValue(row, ["caixa", "investimentos", "dividas"])).toBe(row.patrimonio);
    expect(combinedLabel(["caixa", "investimentos"])).toBe("Caixa + Investimentos");
    expect(combinedLabel(["investimentos", "dividas"])).toBe("Investimentos − Dívidas");
  });

  it("lists each account's evolution and hides accounts that stayed at zero", () => {
    const series = accountSeries(data, "t");
    expect(series.map((item) => item.account.name)).toEqual(["Caixa"]);
    expect(series[0]).toMatchObject({ current: 400, previous: 300 });
    const brunoCashback = accountSeries(data, "b").find((item) => item.account.key === "cashback");
    expect(brunoCashback?.points.map((point) => point.value)).toEqual([50, 0]);
  });

  it("sums debts of the scope and flags people without a declaration", () => {
    const family = debtRows(data, "familia");
    expect(family[0]).toMatchObject({ outstanding: 2300, invoice: 1200, missing: [] });
    expect(family[1]).toMatchObject({ outstanding: 1700, newSincePrevious: 1300, missing: ["t"] });
    expect(debtRows(data, "t")[1]).toMatchObject({ outstanding: null, missing: ["t"] });
  });

  it("builds the upcoming schedule with what is left after each month", () => {
    expect(outlookRows(data, "familia")).toEqual([
      { month: "2026-11", amount: 900, remainingAfter: 900 },
      { month: "2026-12", amount: 600, remainingAfter: 300 },
      { month: "2027-01", amount: 300, remainingAfter: 0 },
    ]);
  });
});
