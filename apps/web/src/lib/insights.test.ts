import { describe, expect, it } from "vitest";
import { FAMILY_SCOPE, accountSeries, summaryRows, type DebtPersonMonth, type EvolutionAccount, type EvolutionData } from "./evolution";
import {
  ACCOUNT_ZEROED_MIN_PREVIOUS,
  INVOICE_ALERT_MIN_DIFFERENCE,
  INVOICE_ALERT_RATIO,
  buildMonthInsights,
  partsText,
  shiftMonth,
  type InsightsInput,
  type MonthInsights,
  type ReserveInput,
} from "./insights";

// Intl usa espaço inseparável depois de "R$"; nos testes, espaço comum.
const plain = (parts: Parameters<typeof partsText>[0]) => partsText(parts).replace(/ /g, " ");
const sentences = (insights: MonthInsights) => insights.sentences.map((sentence) => plain(sentence.parts));
const sentence = (insights: MonthInsights, key: string) => {
  const found = insights.sentences.find((item) => item.key === key);
  return found ? plain(found.parts) : null;
};
const alert = (insights: MonthInsights, kind: string) => {
  const found = insights.alerts.find((item) => item.kind === kind);
  return found ? { ...found, text: plain(found.parts) } : null;
};

const accounts: EvolutionAccount[] = [
  { key: "nubank", personId: "b", name: "Nubank", category: "cash", group: "cash" },
  { key: "xp", personId: "b", name: "XP", category: "investment", group: "investments" },
  { key: "vr", personId: "b", name: "VR", category: "benefit", group: "cash" },
  { key: "caixa-t", personId: "t", name: "Caixa", category: "cash", group: "cash" },
  { key: "inv-t", personId: "t", name: "Investimentos", category: "investment", group: "investments" },
];

function debt(values: Partial<DebtPersonMonth>): DebtPersonMonth {
  return { outstanding: null, invoice: null, invoiceProjected: false, averageInvoice: null, paidSincePrevious: null, newSincePrevious: null, ...values };
}

type MonthSpec = { month: string; balances: Record<string, number>; debtPv: Record<string, number>; debt?: Record<string, DebtPersonMonth> };

function evolution(months: MonthSpec[], schedule: Record<string, Array<{ month: string; amount: number }>> = {}): EvolutionData {
  const last = months[months.length - 1].month;
  return {
    periodMonth: last,
    people: [
      { id: "b", name: "Bruno Savastano" },
      { id: "t", name: "Tatiane" },
    ],
    accounts,
    months: months.map((spec) => ({
      month: spec.month,
      balances: spec.balances,
      debtPv: spec.debtPv,
      debtPvTotal: Object.values(spec.debtPv).reduce((sum, value) => sum + value, 0),
    })),
    debt: {
      months: months.map((spec) => ({ month: spec.month, byPerson: spec.debt ?? {} })),
      outlook: {
        asOfMonth: last,
        byPerson: Object.fromEntries(Object.entries(schedule).map(([personId, items]) => [personId, { baseMonth: last, schedule: items }])),
      },
    },
  };
}

// Setembro → outubro: XP de Bruno sobe 8.000, Caixa de Tatiane cai 3.000, a dívida de Bruno sobe 1.000.
const september: MonthSpec = {
  month: "2026-09",
  balances: { nubank: 10000, xp: 50000, vr: 500, "caixa-t": 8000, "inv-t": 30000 },
  debtPv: { b: 6000, t: 2000 },
  debt: {
    b: debt({ outstanding: 6200, invoice: 3000, averageInvoice: 2800 }),
    t: debt({ outstanding: 2050, invoice: 1000, averageInvoice: 1000 }),
  },
};
const october: MonthSpec = {
  month: "2026-10",
  balances: { nubank: 12000, xp: 58000, vr: 300, "caixa-t": 5000, "inv-t": 30500 },
  debtPv: { b: 7000, t: 2000 },
  debt: {
    b: debt({ outstanding: 7300, invoice: 3200, averageInvoice: 2900, paidSincePrevious: 3000, newSincePrevious: 4100 }),
    t: debt({ outstanding: 2050, invoice: 1040, averageInvoice: 1000, paidSincePrevious: 1000, newSincePrevious: 1000 }),
  },
};
const schedule = {
  b: [
    { month: "2026-10", amount: 3200 },
    { month: "2026-11", amount: 1000 },
    { month: "2026-12", amount: 1100 },
    { month: "2027-01", amount: 1000 },
  ],
  t: [
    { month: "2026-10", amount: 1040 },
    { month: "2026-11", amount: 400 },
    { month: "2026-12", amount: 300 },
  ],
};
const reserve: ReserveInput = { months: 17300 / 4000, previousMonths: 4.1, targetMonths: 6, cashTotal: 17300, monthlyExpenses: 4000 };

function family(data: EvolutionData, overrides: Partial<InsightsInput> = {}) {
  const rows = summaryRows(data, FAMILY_SCOPE);
  const now = rows[rows.length - 1];
  const before = rows.length > 1 ? rows[rows.length - 2] : null;
  return buildMonthInsights({
    evolution: data,
    scope: FAMILY_SCOPE,
    netWorth: { value: now.patrimonio, change: before ? now.patrimonio - before.patrimonio : null },
    reserve,
    ...overrides,
  });
}

function personInsights(data: EvolutionData, personId: string) {
  const rows = summaryRows(data, personId);
  const now = rows[rows.length - 1];
  const before = rows.length > 1 ? rows[rows.length - 2] : null;
  return buildMonthInsights({ evolution: data, scope: personId, netWorth: { value: now.patrimonio, change: before ? now.patrimonio - before.patrimonio : null } });
}

describe("o que mudou este mês", () => {
  it("explains the family's month in four sentences, with the same numbers as the cards", () => {
    const insights = family(evolution([september, october], schedule));
    expect(insights.title).toBe("O que mudou em outubro");
    expect(sentences(insights)).toEqual([
      "Em outubro, o patrimônio da família subiu R$ 6.300: Bruno +R$ 8.800 e Tatiane −R$ 2.500.",
      "O que mais pesou foi o saldo de XP de Bruno, que subiu R$ 8.000; em sentido contrário, o saldo de Caixa de Tatiane caiu R$ 3.000.",
      "No cartão, entraram R$ 5.100 em compras novas e venceram R$ 4.000 em faturas; a fatura de outubro ficou 9% acima da média dos últimos 12 meses.",
      "A reserva de emergência cobre 4,3 meses de gastos (eram 4,1 em setembro).",
    ]);
  });

  it("uses the headline change given by the page, so the sentence never disagrees with the card", () => {
    const insights = family(evolution([september, october], schedule), { netWorth: { value: 96800, change: 6300.4 } });
    expect(sentence(insights, "patrimonio")).toContain("subiu R$ 6.300:");
  });

  it("quotes each account's change exactly like the account sparklines", () => {
    const data = evolution([september, october], schedule);
    const xp = accountSeries(data, FAMILY_SCOPE).find((series) => series.account.key === "xp");
    expect(xp && xp.current - (xp.previous ?? 0)).toBe(8000);
    expect(sentence(family(data), "movimentos")).toContain("XP de Bruno, que subiu R$ 8.000");
  });

  it("says when net worth fell and names the debt by its effect on net worth", () => {
    const data = evolution([
      september,
      { ...october, balances: { ...september.balances, nubank: 9800 }, debtPv: { b: 9000, t: 2000 } },
    ]);
    const insights = family(data);
    expect(sentence(insights, "patrimonio")).toBe("Em outubro, o patrimônio da família caiu R$ 3.200: Bruno −R$ 3.200 e Tatiane R$ 0.");
    expect(sentence(insights, "movimentos")).toBe("O que mais pesou foi o aumento da dívida do cartão de Bruno, que tirou R$ 3.000 do patrimônio.");
  });

  it("calls a tiny change 'praticamente igual' and still shows the biggest moves", () => {
    const data = evolution([
      september,
      { ...september, month: "2026-10", balances: { ...september.balances, nubank: 0, xp: 60080 }, debt: undefined },
    ]);
    const insights = family(data);
    expect(sentence(insights, "patrimonio")).toBe("Em outubro, o patrimônio da família ficou praticamente igual (+R$ 80): Bruno +R$ 80 e Tatiane R$ 0.");
    expect(sentence(insights, "movimentos")).toBe(
      "O maior movimento foi o saldo de XP de Bruno, que subiu R$ 10.080; em sentido contrário, o saldo de Nubank de Bruno caiu R$ 10.000 (parece que o dinheiro só mudou de conta).",
    );
  });

  it("lists the two biggest moves in the same direction when both matter", () => {
    const data = evolution([september, { ...october, balances: { ...october.balances, nubank: 16000, "caixa-t": 8000 } }]);
    expect(sentence(family(data), "movimentos")).toBe(
      "O que mais pesou foram o saldo de XP de Bruno, que subiu R$ 8.000, e o saldo de Nubank de Bruno, que subiu R$ 6.000.",
    );
  });

  it("covers the whole interval when a month was not closed", () => {
    const august = { ...september, month: "2026-08" };
    const insights = family(evolution([august, october]));
    expect(insights.title).toBe("O que mudou de agosto a outubro");
    expect(sentence(insights, "patrimonio")).toMatch(/^De agosto a outubro \(setembro ficou sem fechar\), o patrimônio da família subiu R\$ 6\.300/);

    const july = family(evolution([{ ...september, month: "2026-07" }, october]));
    expect(sentence(july, "patrimonio")).toMatch(/^De julho a outubro \(agosto e setembro ficaram sem fechar\)/);
    const march = family(evolution([{ ...september, month: "2026-03" }, october]));
    expect(sentence(march, "patrimonio")).toMatch(/^De março a outubro \(6 meses ficaram sem fechar\)/);

    const newYear = family(evolution([{ ...september, month: "2025-12" }, { ...october, month: "2026-02" }]));
    expect(newYear.title).toBe("O que mudou de dezembro de 2025 a fevereiro de 2026");
    expect(sentence(newYear, "patrimonio")).toMatch(/^De dezembro de 2025 a fevereiro de 2026 \(janeiro ficou sem fechar\)/);
  });

  it("introduces the first closed month without comparisons", () => {
    const insights = family(evolution([october], schedule), { reserve: { ...reserve, previousMonths: null } });
    expect(insights.title).toBe("Resumo de outubro");
    expect(sentences(insights)).toEqual([
      "Outubro é o primeiro mês fechado: o patrimônio da família começa em R$ 96.800. As comparações aparecem a partir do próximo fechamento.",
      "A reserva de emergência cobre 4,3 meses de gastos.",
    ]);
    expect(insights.alerts.map((item) => item.kind)).toEqual(["reserve_below_goal"]);
  });

  it("talks about one person on the person page, without owner names", () => {
    const insights = personInsights(evolution([september, october], schedule), "t");
    expect(sentences(insights)).toEqual([
      "Em outubro, o patrimônio de Tatiane caiu R$ 2.500.",
      "O que mais pesou foi o saldo de Caixa, que caiu R$ 3.000.",
      "No cartão, entraram R$ 1.000 em compras novas e venceram R$ 1.000 em faturas; a fatura de outubro ficou na média dos últimos 12 meses.",
    ]);
    // Na página da pessoa não há reserva nem aviso de fechamento (são da família).
    expect(insights.alerts).toEqual([]);
  });

  it("matches the person page's debt card when the debt moves", () => {
    const data = evolution([september, october], schedule);
    const rows = summaryRows(data, "b");
    expect(rows[1].dividas - rows[0].dividas).toBe(1000);
    const insights = buildMonthInsights({ evolution: data, scope: "b", netWorth: { value: rows[1].patrimonio, change: rows[1].patrimonio - rows[0].patrimonio } });
    expect(sentence(insights, "movimentos")).toBe(
      "O que mais pesou foi o saldo de XP, que subiu R$ 8.000.",
    );
    const debtHeavy = evolution([september, { ...october, balances: september.balances, debtPv: { b: 9000, t: 2000 } }]);
    const rowsHeavy = summaryRows(debtHeavy, "b");
    const heavy = buildMonthInsights({
      evolution: debtHeavy,
      scope: "b",
      netWorth: { value: rowsHeavy[1].patrimonio, change: rowsHeavy[1].patrimonio - rowsHeavy[0].patrimonio },
    });
    expect(sentence(heavy, "movimentos")).toBe("O que mais pesou foi o aumento da dívida do cartão, que tirou R$ 3.000 do patrimônio.");
  });

  it("names the account type when a person has two accounts with the same name", () => {
    const data = evolution([september, october]);
    data.accounts = data.accounts.map((account) => (account.key === "xp" ? { ...account, name: "Nubank" } : account));
    expect(sentence(family(data), "movimentos")).toContain("o saldo de Nubank (Investimentos) de Bruno, que subiu R$ 8.000");
  });

  it("ignores moves smaller than R$ 50", () => {
    const data = evolution([september, { ...september, month: "2026-10", balances: { ...september.balances, vr: 520 }, debt: undefined }]);
    expect(sentence(family(data), "movimentos")).toBeNull();
  });

  it("explains card refunds and leaves the invoice out of the first month", () => {
    const refunds = evolution([
      september,
      { ...october, debt: { ...october.debt, b: debt({ ...october.debt!.b, newSincePrevious: -300 }) } },
    ]);
    // Estorno de um lado, compras do outro: na família, entram as compras líquidas.
    expect(sentence(family(refunds), "cartao")).toMatch(/^No cartão, entraram R\$ 700 em compras novas e venceram R\$ 4\.000 em faturas;/);
    const onlyRefund = evolution([
      september,
      {
        ...october,
        debt: {
          b: debt({ ...october.debt!.b, newSincePrevious: -500 }),
          t: debt({ ...october.debt!.t, newSincePrevious: -100 }),
        },
      },
    ]);
    expect(sentence(family(onlyRefund), "cartao")).toMatch(
      /^No cartão, venceram R\$ 4\.000 em faturas e as parcelas futuras diminuíram R\$ 600 \(estornos ou ajustes\);/,
    );
    expect(sentence(family(evolution([october])), "cartao")).toBeNull();
  });

  it("drops the card sentence when someone did not declare and excludes that debt from the moves", () => {
    const data = evolution([
      september,
      { ...october, debtPv: { b: 7000 }, debt: { b: october.debt!.b, t: debt({ averageInvoice: 1000 }) } },
    ]);
    const insights = family(data);
    expect(sentence(insights, "cartao")).toBeNull();
    // A "queda" da dívida de Tatiane é falta de declaração, não movimento.
    expect(sentence(insights, "movimentos")).not.toContain("dívida do cartão de Tatiane");
    expect(alert(insights, "missing_debt_declaration")?.text).toBe(
      "Tatiane não declarou as dívidas do cartão em outubro (em setembro havia R$ 2.050 a pagar). Sem elas, o patrimônio aparece maior do que é.",
    );
  });

  it("states the reserve against the goal once it is reached", () => {
    const insights = family(evolution([september, october]), { reserve: { ...reserve, months: 6.5, previousMonths: 6.5 } });
    expect(sentence(insights, "reserva")).toBe("A reserva de emergência cobre 6,5 meses de gastos (como em setembro), e a meta de 6 meses já foi alcançada.");
    expect(alert(insights, "reserve_below_goal")).toBeNull();
    expect(sentence(family(evolution([september, october]), { reserve: { ...reserve, monthlyExpenses: 0 } }), "reserva")).toBeNull();
  });

  it("keeps between two and four sentences", () => {
    for (const insights of [family(evolution([september, october], schedule)), personInsights(evolution([september, october]), "b")]) {
      expect(insights.sentences.length).toBeGreaterThanOrEqual(2);
      expect(insights.sentences.length).toBeLessThanOrEqual(4);
    }
  });

  it("says when a person has nothing recorded yet", () => {
    const data = evolution([september, october]);
    data.people.push({ id: "x", name: "Visita" });
    const insights = buildMonthInsights({ evolution: data, scope: "x", netWorth: { value: 0, change: 0 } });
    expect(sentences(insights)).toEqual(["Ainda não há saldos de Visita nos meses fechados."]);
    expect(insights.alerts).toEqual([]);
  });
});

describe("pontos de atenção", () => {
  const base = () => evolution([september, october], schedule);

  it("has no alerts in a calm month", () => {
    expect(family(base(), { reserve: null }).alerts).toEqual([]);
  });

  it("flags an invoice well above the 12-month average, and moves that fact out of the sentence", () => {
    const withInvoice = (invoice: number) =>
      evolution([september, { ...october, debt: { b: debt({ ...october.debt!.b, invoice, averageInvoice: 3000 }), t: debt({ ...october.debt!.t, invoice: 0, averageInvoice: 900 }) } }]);
    // Família: média 3.900. 25% acima = 4.875.
    const fires = family(withInvoice(4875), { reserve: null });
    expect(alert(fires, "invoice_above_average")).toMatchObject({
      severity: "medium",
      title: "Fatura acima da média",
      text: "A fatura de outubro (R$ 4.875) ficou 25% acima da média dos últimos 12 meses (R$ 3.900).",
    });
    expect(sentence(fires, "cartao")).toBe("No cartão, entraram R$ 5.100 em compras novas e venceram R$ 4.000 em faturas.");
    expect(alert(family(withInvoice(4860), { reserve: null }), "invoice_above_average")).toBeNull();
    expect(INVOICE_ALERT_RATIO).toBe(0.25);
  });

  it("does not flag small invoices or invoices projected from an older declaration", () => {
    const small = evolution([
      september,
      { ...october, debt: { b: debt({ ...october.debt!.b, invoice: 400, averageInvoice: 200 }), t: debt({ ...october.debt!.t, invoice: 0, averageInvoice: 0 }) } },
    ]);
    expect(400 - 200).toBeLessThan(INVOICE_ALERT_MIN_DIFFERENCE);
    expect(alert(family(small), "invoice_above_average")).toBeNull();
    const projected = evolution([
      september,
      { ...october, debt: { b: debt({ ...october.debt!.b, invoice: 9000, invoiceProjected: true }), t: october.debt!.t } },
    ]);
    expect(alert(family(projected), "invoice_above_average")).toBeNull();
  });

  it("flags card debt rising for three closes in a row", () => {
    const month = (name: string, outstanding: number) => ({
      ...september,
      month: name,
      debt: { b: debt({ outstanding }), t: debt({ outstanding: 1000 }) },
    });
    const rising = family(evolution([month("2026-06", 5000), month("2026-07", 6000), month("2026-08", 7000), month("2026-09", 8000)]), { reserve: null });
    expect(alert(rising, "debt_rising")?.text).toBe("O total a pagar no cartão sobe há 3 meses seguidos: foi de R$ 6.000 em junho para R$ 9.000 em setembro.");
    const twoSteps = family(evolution([month("2026-06", 9000), month("2026-07", 6000), month("2026-08", 7000), month("2026-09", 8000)]), { reserve: null });
    expect(alert(twoSteps, "debt_rising")).toBeNull();
  });

  it("flags a reserve below the goal with how much is missing, stronger below 40% of the goal", () => {
    const insights = family(base());
    expect(alert(insights, "reserve_below_goal")).toMatchObject({
      severity: "medium",
      text: "Faltam cerca de R$ 6.700 em caixa para a reserva cobrir os 6 meses de gastos da meta.",
    });
    // Abaixo da meta, a frase não repete a meta (o alerta já diz quanto falta).
    expect(sentence(insights, "reserva")).toBe("A reserva de emergência cobre 4,3 meses de gastos (eram 4,1 em setembro).");
    expect(alert(family(base(), { reserve: { ...reserve, months: 2, cashTotal: 8000 } }), "reserve_below_goal")?.severity).toBe("high");
  });

  it("flags accounts in the red and accounts that went to zero", () => {
    const data = evolution([september, { ...october, balances: { ...october.balances, nubank: -300, vr: 0, "caixa-t": 0 } }]);
    const insights = family(data, { reserve: null });
    expect(alert(insights, "account_negative")).toMatchObject({
      severity: "high",
      title: "Conta no vermelho",
      text: "O saldo de Nubank de Bruno fechou outubro em −R$ 300.",
    });
    expect(alert(insights, "account_zeroed")).toMatchObject({
      title: "Contas zeradas",
      text: "Zeraram em outubro: VR de Bruno (era R$ 500) e Caixa de Tatiane (era R$ 8.000). Se não foi de propósito, vale conferir o fechamento.",
    });
    // Conta com menos de R$ 100 que zera não vira aviso.
    const tiny = evolution([{ ...september, balances: { ...september.balances, vr: ACCOUNT_ZEROED_MIN_PREVIOUS - 1 } }, { ...october, balances: { ...october.balances, vr: 0 } }]);
    expect(alert(family(tiny), "account_zeroed")).toBeNull();
  });

  it("reminds about months not closed yet, only when today is given", () => {
    expect(alert(family(base(), { today: "2026-10" }), "close_pending")).toBeNull();
    expect(alert(family(base(), { today: "2026-11" }), "close_pending")).toMatchObject({
      severity: "medium",
      title: "Mês por fechar",
      text: "Novembro ainda não foi fechado: os números desta página vão até outubro.",
    });
    expect(alert(family(base(), { today: "2027-01" }), "close_pending")).toMatchObject({
      severity: "high",
      title: "Meses por fechar",
      text: "Faltam fechar 3 meses, de novembro de 2026 a janeiro de 2027: os números desta página vão até outubro.",
    });
    expect(alert(family(base(), { today: null }), "close_pending")).toBeNull();
  });

  it("warns about heavy installments in the next three months", () => {
    // Média da família: 3.900; metade = 1.950.
    const heavy = { b: [...schedule.b.slice(0, 1), { month: "2026-12", amount: 2400 }, { month: "2027-02", amount: 5000 }], t: schedule.t };
    const insights = family(evolution([september, october], heavy), { reserve: null });
    expect(alert(insights, "upcoming_installments")?.text).toBe(
      "Só de compras já parceladas, vencem R$ 2.700 em dezembro: 69% da fatura média dos últimos 12 meses (R$ 3.900), antes de qualquer compra nova.",
    );
    const two = { b: [{ month: "2026-11", amount: 1600 }, { month: "2026-12", amount: 1700 }], t: schedule.t };
    expect(alert(family(evolution([september, october], two), { reserve: null }), "upcoming_installments")?.text).toBe(
      "Só de compras já parceladas, vencem R$ 2.000 em novembro e R$ 2.000 em dezembro: em cada mês, pelo menos 50% da fatura média dos últimos 12 meses (R$ 3.900), antes de qualquer compra nova.",
    );
  });

  it("does not flag a missing declaration for someone who had nothing to declare before", () => {
    const data = evolution([
      { ...september, debt: { b: september.debt!.b, t: debt({}) } },
      { ...october, debt: { b: october.debt!.b, t: debt({}) } },
    ]);
    expect(alert(family(data), "missing_debt_declaration")).toBeNull();
  });

  it("puts the important alerts first", () => {
    const data = evolution([september, { ...october, balances: { ...october.balances, vr: -50 } }], schedule);
    const kinds = family(data, { today: "2027-01" }).alerts.map((item) => [item.kind, item.severity]);
    expect(kinds).toEqual([
      ["account_negative", "high"],
      ["close_pending", "high"],
      ["reserve_below_goal", "medium"],
    ]);
  });
});

describe("helpers", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
