import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateBudgetMetrics, calculateDebtMetrics, toMoneyNumber } from "@finance/financial-calculations";
import {
  parseBudgetItems,
  parseDebtCashflows,
  parseGoals,
  parseWorkbook,
  readWorkbook,
} from "@/server/import-excel";
import { formatPeriod } from "@/lib/date";

const workbookPath =
  process.env.DEFAULT_EXCEL_PATH ??
  "G:/Meu Drive/Seagate/Pessoal/Documentos/Financeiro/Plan_Fin_melhorada_claudeV2.xlsx";

const maybeDescribe = fs.existsSync(workbookPath) ? describe : describe.skip;

maybeDescribe("Excel import parser", () => {
  it("reads the real workbook and extracts the May 2026 acceptance KPIs", () => {
    const workbook = readWorkbook(workbookPath);
    const parsed = parseWorkbook(workbook);

    expect(parsed.sourceRows.length).toBeGreaterThanOrEqual(14);
    const may2026 = parsed.sourceRows.find((row) => formatPeriod(row.periodMonth) === "2026-05-01");

    expect(may2026).toBeDefined();
    expect(may2026?.expected.netWorth).toBeCloseTo(275223.18, 2);
    expect(may2026?.expected.cashTotal).toBeCloseTo(184408.62, 2);
    expect(may2026?.expected.investmentsTotal).toBeCloseTo(140124.1, 2);
    expect(may2026?.expected.debtPvTotal).toBeCloseTo(49309.54, 2);
    expect(may2026?.expected.debtToAssets).toBeCloseTo(0.1519, 4);
    expect(may2026?.expected.reserveMonths).toBeCloseTo(4.96, 2);
  });

  it("normalizes the debt matrix into cashflows that reconcile May 2026", () => {
    const workbook = readWorkbook(workbookPath);
    const parsed = parseWorkbook(workbook);
    const peopleByName = new Map([
      ["bruno", { id: "bruno" }],
      ["tatiane", { id: "tatiane" }],
    ]);

    const cashflows = parseDebtCashflows(parsed.debtRows, peopleByName);
    const mayCashflows = cashflows.filter((flow) => formatPeriod(flow.invoiceMonth) === "2026-05-01");
    const metrics = calculateDebtMetrics(mayCashflows, 0.15, "2026-05-01");

    expect(mayCashflows.length).toBeGreaterThan(0);
    expect(toMoneyNumber(metrics.nominalTotal)).toBeCloseTo(50345.59, 2);
    expect(toMoneyNumber(metrics.presentValueTotal)).toBeCloseTo(49309.54, 2);
  });

  it("extracts recurring budget items and goal rows", () => {
    const workbook = readWorkbook(workbookPath);
    const parsed = parseWorkbook(workbook);
    const peopleByName = new Map([
      ["bruno", { id: "bruno" }],
      ["tatiane", { id: "tatiane" }],
    ]);
    const firstMonth = parsed.sourceRows[0].periodMonth;

    const budgetItems = parseBudgetItems(parsed.budgetRows, peopleByName, firstMonth, "household");
    const budget = calculateBudgetMetrics(
      budgetItems.map((item) => ({
        personId: item.personId,
        kind: item.kind,
        amountMonthly: item.amountMonthly,
        recurrence: item.recurrence,
        startMonth: item.startMonth,
        isActive: item.isActive,
      })),
      "2026-05-01",
    );
    const goals = parseGoals(parsed.goalRows, "household");

    expect(toMoneyNumber(budget.incomeTotal)).toBeCloseTo(57096.5, 2);
    expect(toMoneyNumber(budget.expenseTotal)).toBeCloseTo(37163.66, 2);
    expect(goals).toHaveLength(20);
    expect(goals.some((goal) => goal.goal.metricKey === "pl_total")).toBe(true);
    expect(goals.some((goal) => goal.goal.title === "TOTAL GERAL:")).toBe(false);
    expect(goals.some((goal) => goal.goal.title === "MARCO")).toBe(false);
    expect(goals.some((goal) => goal.goal.title === "R$ 500 mil")).toBe(false);
    expect(goals.find((goal) => goal.goal.metricKey === "pl_total" && goal.goal.targetValueDecimal === 500000)?.goal.targetDate).toBe("2027-12-01");
  });
});
