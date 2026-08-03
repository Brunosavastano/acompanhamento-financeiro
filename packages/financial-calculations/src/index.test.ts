import { describe, expect, it } from "vitest";
import {
  calculateBudgetMetrics,
  calculateBudgetProjection,
  calculateDebtMetrics,
  calculateMonthlyInvoiceMetrics,
  calculateGoalProgress,
  calculateMovingAverageExpense,
  calculatePatrimonyMetrics,
  calculateRequiredCagr,
  dedupeLatestInvoiceBase,
  presentValue,
  toMoneyNumber,
} from "./index";

describe("financial calculations", () => {
  it("calculates present value with Selic converted to monthly rate", () => {
    expect(toMoneyNumber(presentValue(1000, 12, 0.15))).toBe(869.57);
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

  it("calculates goal progress and CAGR", () => {
    expect(calculateGoalProgress({ comparisonOperator: "greater_or_equal", currentValue: 50, targetValue: 100 }).toNumber()).toBe(0.5);
    expect(calculateGoalProgress({ comparisonOperator: "less_or_equal", currentValue: 0.15, targetValue: 0.1, riskCapValue: 0.2 }).toFixed(2)).toBe("0.50");
    expect(calculateRequiredCagr(275223.18, 500000, 2).toFixed(4)).toBe("0.3479");
  });
});
