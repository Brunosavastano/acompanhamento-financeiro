import { describe, expect, it } from "vitest";
import {
  calculateBudgetMetrics,
  calculateBudgetProjection,
  calculateDebtEvolution,
  calculateDebtMetrics,
  calculateDebtOutlook,
  calculateMonthlyInvoiceMetrics,
  calculateGoalProgress,
  calculateMovingAverageExpense,
  calculatePatrimonyMetrics,
  calculateRequiredCagr,
  cardKey,
  dedupeLatestInvoiceBase,
  goalStatusFor,
  presentValue,
  realizedInvoiceExpenses,
  toMoneyNumber,
} from "./index";

describe("financial calculations", () => {
  it("calculates present value with Selic converted to monthly rate", () => {
    expect(toMoneyNumber(presentValue(1000, 12, 0.15))).toBe(869.57);
  });

  it("tracks card debt month by month with the paid + new bridge", () => {
    const flows = [
      // Setembro: fatura de set 1000, parcelas futuras out 600 e nov 400.
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-09-01", amount: 1000 },
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-10-01", amount: 600 },
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-11-01", amount: 400 },
      // Novembro (outubro pulado): fatura de nov 900, dez 500, jan 300.
      { personId: "bruno", invoiceMonth: "2026-11-01", paymentMonth: "2026-11-01", amount: 900 },
      { personId: "bruno", invoiceMonth: "2026-11-01", paymentMonth: "2026-12-01", amount: 500 },
      { personId: "bruno", invoiceMonth: "2026-11-01", paymentMonth: "2027-01-01", amount: 300 },
      // Tatiane só declarou em setembro.
      { personId: "tatiane", invoiceMonth: "2026-09-01", paymentMonth: "2026-09-01", amount: 200 },
      { personId: "tatiane", invoiceMonth: "2026-09-01", paymentMonth: "2026-12-01", amount: 100 },
    ];
    const [september, november] = calculateDebtEvolution(flows, ["2026-11-01", "2026-09-01"]);

    expect(september.month).toBe("2026-09-01");
    expect(toMoneyNumber(september.byPerson.bruno.outstanding!)).toBe(2000);
    expect(september.byPerson.bruno.paidSincePrevious).toBeNull();

    const bruno = november.byPerson.bruno;
    expect(toMoneyNumber(bruno.outstanding!)).toBe(1700);
    // Venceram set (1000) e out (600) pela declaração de setembro.
    expect(toMoneyNumber(bruno.paidSincePrevious!)).toBe(1600);
    // Sobravam 400 de setembro; a declaração de novembro tem 1700 → 1300 de compras novas.
    expect(toMoneyNumber(bruno.newSincePrevious!)).toBe(1300);
    expect(toMoneyNumber(bruno.outstanding!)).toBe(2000 - 1600 + 1300);
    expect(toMoneyNumber(bruno.invoice!)).toBe(900);
    expect(bruno.invoiceProjected).toBe(false);
    // Média das faturas realizadas: set 1000 e nov 900.
    expect(toMoneyNumber(bruno.averageInvoice!)).toBe(950);

    // Sem declaração em novembro: total desconhecido e fatura projetada (zero vencendo em nov).
    const tatiane = november.byPerson.tatiane;
    expect(tatiane.outstanding).toBeNull();
    expect(tatiane.newSincePrevious).toBeNull();
    expect(tatiane.invoice).toBeNull();
  });

  it("projects the upcoming installments from each person's latest declaration", () => {
    const flows = [
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-12-01", amount: 999 },
      { personId: "bruno", invoiceMonth: "2026-11-01", paymentMonth: "2026-11-01", amount: 900 },
      { personId: "bruno", invoiceMonth: "2026-11-01", paymentMonth: "2026-12-01", amount: 500 },
      { personId: "bruno", invoiceMonth: "2026-12-01", paymentMonth: "2027-01-01", amount: 1 },
      { personId: "tatiane", invoiceMonth: "2026-09-01", paymentMonth: "2026-10-01", amount: 50 },
      { personId: "tatiane", invoiceMonth: "2026-09-01", paymentMonth: "2027-02-01", amount: 100 },
    ];
    const outlook = calculateDebtOutlook(flows, "2026-11-01");

    expect(outlook.byPerson.bruno.baseMonth).toBe("2026-11-01");
    expect(outlook.byPerson.bruno.schedule.map((row) => [row.month, toMoneyNumber(row.amount)])).toEqual([
      ["2026-11-01", 900],
      ["2026-12-01", 500],
    ]);
    // Tatiane: declaração de setembro, só o que ainda vence a partir de novembro.
    expect(outlook.byPerson.tatiane.schedule.map((row) => [row.month, toMoneyNumber(row.amount)])).toEqual([["2027-02-01", 100]]);
  });

  it("calculates debt nominal, PV and float", () => {
    const metrics = calculateDebtMetrics(
      [
        { personId: "bruno", invoiceMonth: "2026-05-01", paymentMonth: "2026-05-01", amount: 1000 },
        { personId: "bruno", invoiceMonth: "2026-05-01", paymentMonth: "2026-06-01", amount: 1000 },
      ],
      0.15,
      "2026-05-01",
    );
    expect(toMoneyNumber(metrics.nominalTotal)).toBe(2000);
    expect(toMoneyNumber(metrics.presentValueTotal)).toBe(1988.42);
    expect(toMoneyNumber(metrics.floatGain)).toBe(11.58);
    expect(toMoneyNumber(metrics.monthlyInvoiceTotal)).toBe(1000);
  });

  it("calculates monthly invoice by payment month across invoice cohorts", () => {
    const metrics = calculateMonthlyInvoiceMetrics(
      [
        { personId: "bruno", invoiceMonth: "2026-04-01", paymentMonth: "2026-05-01", amount: 300 },
        { personId: "bruno", invoiceMonth: "2026-05-01", paymentMonth: "2026-06-01", amount: 1000 },
        { personId: "tatiane", invoiceMonth: "2026-03-01", paymentMonth: "2026-05-01", amount: 200 },
      ],
      "2026-05-01",
    );

    expect(toMoneyNumber(metrics.monthlyInvoiceTotal)).toBe(500);
    expect(toMoneyNumber(metrics.byPerson.bruno)).toBe(300);
    expect(toMoneyNumber(metrics.byPerson.tatiane)).toBe(200);
  });

  it("calculates patrimony metrics", () => {
    const metrics = calculatePatrimonyMetrics({
      positions: [
        { personId: "bruno", category: "cash", amount: 100 },
        { personId: "bruno", category: "investment", amount: 300 },
      ],
      debtPvTotal: 50,
      previousNetWorth: 300,
      incomeTotal: 1000,
      expenseTotal: 700,
    });
    expect(toMoneyNumber(metrics.netWorth)).toBe(350);
    expect(metrics.debtToAssets.toFixed(4)).toBe("0.1250");
    expect(metrics.reserveMonths.toFixed(4)).toBe("0.1429");
    expect(metrics.patrimonialSavingsRate.toFixed(4)).toBe("0.0500");
    expect(metrics.budgetSavingsRate.toFixed(4)).toBe("0.3000");
  });

  it("calculates budget totals", () => {
    const metrics = calculateBudgetMetrics(
      [
        { kind: "income", amountMonthly: 1000, startMonth: "2026-01-01" },
        { kind: "fixed_expense", amountMonthly: 400 },
        { kind: "variable_expense", amountMonthly: 150 },
      ],
      "2026-05-01",
    );
    expect(toMoneyNumber(metrics.monthlySurplus)).toBe(450);
    expect(metrics.incomeCommitment.toFixed(2)).toBe("0.55");
  });

  it("applies one-off budget items only in their start month", () => {
    const may = calculateBudgetMetrics(
      [
        { kind: "income", amountMonthly: 5000, startMonth: "2026-01-01" },
        { kind: "variable_expense", amountMonthly: 1200, recurrence: "one_off", startMonth: "2026-05-01" },
      ],
      "2026-05-01",
    );
    const june = calculateBudgetMetrics(
      [
        { kind: "income", amountMonthly: 5000, startMonth: "2026-01-01" },
        { kind: "variable_expense", amountMonthly: 1200, recurrence: "one_off", startMonth: "2026-05-01" },
      ],
      "2026-06-01",
    );
    expect(toMoneyNumber(may.expenseTotal)).toBe(1200);
    expect(toMoneyNumber(june.expenseTotal)).toBe(0);
  });

  it("calculates card moving average using available invoice months in the 12-month window", () => {
    const average = calculateMovingAverageExpense(
      [
        { periodMonth: "2025-04-01", amount: 999 },
        { periodMonth: "2025-06-01", amount: 600 },
        { periodMonth: "2026-04-01", amount: 900 },
        { periodMonth: "2026-05-01", amount: 1500 },
      ],
      "2026-05-01",
      12,
    );

    expect(average.monthsUsed).toBe(3);
    expect(toMoneyNumber(average.total)).toBe(3000);
    expect(toMoneyNumber(average.averageMonthly)).toBe(1000);
  });

  it("adds card moving average to budget projection without changing base item totals", () => {
    const metrics = calculateBudgetProjection({
      items: [
        { kind: "income", amountMonthly: 5000, startMonth: "2026-01-01" },
        { kind: "variable_expense", amountMonthly: 1200, recurrence: "one_off", startMonth: "2026-05-01" },
      ],
      periodMonth: "2026-05-01",
      cardExpenses: [
        { periodMonth: "2026-04-01", amount: 900 },
        { periodMonth: "2026-05-01", amount: 1100 },
      ],
    });

    expect(toMoneyNumber(metrics.budgetItemVariableExpenseTotal)).toBe(1200);
    expect(toMoneyNumber(metrics.cardMovingAverageExpense)).toBe(1000);
    expect(toMoneyNumber(metrics.cardMovingAverageAppliedExpense)).toBe(1000);
    expect(metrics.cardMovingAverageApplied).toBe(true);
    expect(toMoneyNumber(metrics.variableExpenseTotal)).toBe(2200);
    expect(toMoneyNumber(metrics.monthlySurplus)).toBe(2800);
  });

  it("does not double count moving average when an active card budget item already exists", () => {
    const metrics = calculateBudgetProjection({
      items: [
        { kind: "income", amountMonthly: 5000, startMonth: "2026-01-01" },
        { name: "Fatura cartao media 12m", kind: "variable_expense", amountMonthly: 1200, startMonth: "2026-01-01" },
      ],
      periodMonth: "2026-05-01",
      cardExpenses: [{ periodMonth: "2026-05-01", amount: 1000 }],
    });

    expect(toMoneyNumber(metrics.budgetItemVariableExpenseTotal)).toBe(1200);
    expect(toMoneyNumber(metrics.cardMovingAverageExpense)).toBe(1000);
    expect(toMoneyNumber(metrics.cardMovingAverageAppliedExpense)).toBe(0);
    expect(metrics.cardMovingAverageApplied).toBe(false);
    expect(toMoneyNumber(metrics.variableExpenseTotal)).toBe(1200);
  });

  it("keeps only the latest invoice base per person, card and payment month", () => {
    const deduped = dedupeLatestInvoiceBase([
      // Projeção de setembro declarada em julho e re-declarada em agosto: só agosto vale.
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-07-01", paymentMonth: "2026-09-01", amount: 8000 },
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-08-01", paymentMonth: "2026-09-01", amount: 7772.28 },
      // Parcela antiga nunca re-declarada continua contando.
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-05-01", paymentMonth: "2026-12-01", amount: 250 },
      // Pessoas e cartões diferentes não se substituem.
      { personId: "tatiane", cardName: "Cartão principal", invoiceMonth: "2026-07-01", paymentMonth: "2026-09-01", amount: 400 },
      { personId: "bruno", cardName: "Outro cartão", invoiceMonth: "2026-07-01", paymentMonth: "2026-09-01", amount: 150 },
      // Duas linhas na MESMA base e mês (parcelas distintas) são preservadas.
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-08-01", paymentMonth: "2026-10-01", amount: 100 },
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-08-01", paymentMonth: "2026-10-01", amount: 200 },
    ]);

    expect(deduped.map((flow) => flow.amount)).toEqual([7772.28, 250, 400, 150, 100, 200]);
  });

  it("keeps additive purchases across bases without evicting declared projections", () => {
    const deduped = dedupeLatestInvoiceBase([
      // Projeção de novembro declarada na base de agosto.
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-08-01", paymentMonth: "2026-11-01", amount: 2000, source: "manual_matrix" },
      // Parcela avulsa lançada numa base MAIS NOVA: soma, não evicta a projeção.
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-09-01", paymentMonth: "2026-11-01", amount: 100, source: "purchase" },
    ]);
    expect(deduped.map((flow) => flow.amount)).toEqual([2000, 100]);

    // E uma declaração mais nova continua substituindo a antiga, preservando a avulsa.
    const withNewerDeclaration = dedupeLatestInvoiceBase([
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-08-01", paymentMonth: "2026-11-01", amount: 2000, source: "manual_matrix" },
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-09-01", paymentMonth: "2026-11-01", amount: 100, source: "purchase" },
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-10-01", paymentMonth: "2026-11-01", amount: 2200, source: "adjustment" },
    ]);
    expect(withNewerDeclaration.map((flow) => flow.amount)).toEqual([100, 2200]);
  });

  it("treats card names that differ only by accent, case or spacing as the same card", () => {
    expect(cardKey("Cartao principal")).toBe(cardKey("Cartão principal"));
    expect(cardKey("  CARTÃO   Principal ")).toBe(cardKey("Cartão principal"));
    expect(cardKey("Outro cartão")).not.toBe(cardKey("Cartão principal"));

    // Caso real de produção: projeção importada como "Cartao principal" (sem til)
    // e re-declarada pela UI como "Cartão principal" — não pode somar em dobro.
    const deduped = dedupeLatestInvoiceBase([
      { personId: "bruno", cardName: "Cartao principal", invoiceMonth: "2026-05-01", paymentMonth: "2026-07-01", amount: 3884.36, source: "import" },
      { personId: "bruno", cardName: "Cartão principal", invoiceMonth: "2026-07-01", paymentMonth: "2026-07-01", amount: 27440.1, source: "manual_matrix" },
    ]);
    expect(deduped.map((flow) => flow.amount)).toEqual([27440.1]);
  });

  it("counts only the invoice declared in its own month as realized card spending", () => {
    const realized = realizedInvoiceExpenses([
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-09-01", amount: 15356.88 },
      // projeção de outubro feita em setembro: não é gasto realizado de outubro
      { personId: "bruno", invoiceMonth: "2026-09-01", paymentMonth: "2026-10-01", amount: 7042.32 },
      { personId: "tatiane", invoiceMonth: "2026-11-01", paymentMonth: "2026-11-01", amount: 8349.2 },
    ]);
    expect(realized).toEqual([
      { personId: "bruno", periodMonth: "2026-09-01", amount: 15356.88 },
      { personId: "tatiane", periodMonth: "2026-11-01", amount: 8349.2 },
    ]);

    // Mês sem declaração própria (outubro) fica fora; cada pessoa tem a sua média
    // (Entradas!C31 e D31 da planilha) e o total é a soma (E31 = C31 + D31).
    const average = calculateMovingAverageExpense(realized, "2026-11-01", 12);
    expect(average.monthsUsed).toBe(2);
    expect(toMoneyNumber(average.averageMonthly)).toBe(23706.08);
  });

  it("averages card spending per person, ignoring a person's months without invoice (AVERAGEIF <>0)", () => {
    const average = calculateMovingAverageExpense(
      [
        { personId: "bruno", periodMonth: "2026-07-01", amount: 1000 },
        { personId: "bruno", periodMonth: "2026-08-01", amount: 1000 },
        { personId: "bruno", periodMonth: "2026-09-01", amount: 1000 },
        { personId: "tatiane", periodMonth: "2026-07-01", amount: 500 },
        { personId: "tatiane", periodMonth: "2026-09-01", amount: 500 },
        { personId: "tatiane", periodMonth: "2026-08-01", amount: 0 },
      ],
      "2026-09-01",
      12,
    );
    // Por família daria (1500 + 1000 + 1500) / 3 = 1333,33 — diluindo a Tatiane com um zero.
    expect(toMoneyNumber(average.averageMonthly)).toBe(1500);
    expect(average.monthsUsed).toBe(3);
    expect(toMoneyNumber(average.total)).toBe(4000);
  });

  it("normalizes the patrimonial savings rate when a month was skipped", () => {
    const consecutive = calculatePatrimonyMetrics({
      positions: [{ personId: "bruno", category: "cash", amount: 1000 }],
      debtPvTotal: 0,
      previousNetWorth: 800,
      incomeTotal: 1000,
      expenseTotal: 500,
    });
    const skipped = calculatePatrimonyMetrics({
      positions: [{ personId: "bruno", category: "cash", amount: 1000 }],
      debtPvTotal: 0,
      previousNetWorth: 800,
      incomeTotal: 1000,
      expenseTotal: 500,
      monthsSincePrevious: 2,
    });
    expect(toMoneyNumber(skipped.monthlyVariation)).toBe(200);
    expect(consecutive.patrimonialSavingsRate.toFixed(2)).toBe("0.20");
    expect(skipped.patrimonialSavingsRate.toFixed(2)).toBe("0.10");
  });

  it("never throws on non-numeric goal values", () => {
    expect(calculateGoalProgress({ comparisonOperator: "greater_or_equal", currentValue: 50, targetValue: "1.000.000" }).toNumber()).toBe(0);
    expect(calculateGoalProgress({ comparisonOperator: "greater_or_equal", currentValue: "Estudando", targetValue: 10 }).toNumber()).toBe(0);
    expect(calculateGoalProgress({ comparisonOperator: "manual", currentValue: "Aprovado", targetValue: "Level II" }).toNumber()).toBe(0);
  });

  it("classifies goal status by horizon like the spreadsheet", () => {
    expect(goalStatusFor(1, "long")).toBe("achieved");
    expect(goalStatusFor(0.75, "short")).toBe("in_progress");
    expect(goalStatusFor(0.55, "short")).toBe("attention");
    expect(goalStatusFor(0.55, "medium")).toBe("in_progress");
    expect(goalStatusFor(0.27, "medium")).toBe("long_term");
    expect(goalStatusFor(0.0003, "long")).toBe("long_term");
    expect(goalStatusFor(0.12, "long")).toBe("in_progress");
  });

  it("applies the card average only for people without their own card item", () => {
    const cardExpenses = [
      { personId: "bruno", periodMonth: "2026-10-01", amount: 9000 },
      { personId: "bruno", periodMonth: "2026-11-01", amount: 11000 },
      { personId: "tatiane", periodMonth: "2026-10-01", amount: 6000 },
      { personId: "tatiane", periodMonth: "2026-11-01", amount: 8000 },
    ];
    // Item fixo só do Bruno: a média da Tatiane (7.000) continua entrando.
    const partial = calculateBudgetProjection({
      items: [{ personId: "bruno", name: "Fatura cartão (média 12m)", kind: "variable_expense", amountMonthly: 9828.34, startMonth: "2025-04-01" }],
      periodMonth: "2026-11-01",
      cardExpenses,
    });
    expect(toMoneyNumber(partial.cardMovingAverageExpense)).toBe(17000);
    expect(toMoneyNumber(partial.cardMovingAverageAppliedExpense)).toBe(7000);
    expect(toMoneyNumber(partial.variableExpenseTotal)).toBe(16828.34);
    expect(partial.cardMovingAverageApplied).toBe(true);

    // Uma "Anuidade do cartão" é despesa comum: não desliga a média.
    const withFee = calculateBudgetProjection({
      items: [{ personId: null, name: "Anuidade do cartão", kind: "variable_expense", amountMonthly: 45, startMonth: "2025-04-01" }],
      periodMonth: "2026-11-01",
      cardExpenses,
    });
    expect(toMoneyNumber(withFee.cardMovingAverageAppliedExpense)).toBe(17000);
    expect(toMoneyNumber(withFee.variableExpenseTotal)).toBe(17045);
  });

  it("calculates goal progress and CAGR", () => {
    expect(calculateGoalProgress({ comparisonOperator: "greater_or_equal", currentValue: 50, targetValue: 100 }).toNumber()).toBe(0.5);
    expect(calculateGoalProgress({ comparisonOperator: "less_or_equal", currentValue: 0.15, targetValue: 0.1, riskCapValue: 0.2 }).toFixed(2)).toBe("0.50");
    expect(calculateRequiredCagr(275223.18, 500000, 2).toFixed(4)).toBe("0.3479");
  });
});
