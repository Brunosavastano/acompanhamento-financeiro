import { createRequire } from "node:module";
import type * as XLSXModule from "xlsx";
import { isBudgetItemActive, toMoneyNumber } from "@finance/financial-calculations";
import { prisma } from "@/lib/prisma";
import { asMonthStart, formatPeriod } from "@/lib/date";
import { toDecimalNumber } from "@/lib/format";
import type { ExportSheet, ExportWorkbookData } from "@/lib/export-workbook";
import { getEvolutionData } from "@/server/evolution";
import { calculateBudgetProjectionForPeriod, getGoalRows, getLatestSnapshot, getSnapshotHistory } from "@/server/metrics";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof XLSXModule;

/**
 * Dados da planilha de exportação, pelas mesmas funções das telas: histórico
 * do dashboard, evolução por conta, orçamento e metas no último mês fechado
 * (última revisão de cada mês) e todos os lançamentos do cartão.
 */
export async function getExportWorkbookData(householdId: string): Promise<ExportWorkbookData> {
  const latest = await getLatestSnapshot(householdId);
  const referenceMonth = latest?.periodMonth ?? asMonthStart(new Date());
  const period = formatPeriod(referenceMonth);

  const [history, evolution, flows, budgetItems, goals] = await Promise.all([
    getSnapshotHistory(householdId),
    getEvolutionData(householdId, referenceMonth),
    prisma.debtCashflow.findMany({ where: { householdId }, include: { person: { select: { name: true } } } }),
    prisma.budgetItem.findMany({ where: { householdId }, include: { person: { select: { name: true } } } }),
    getGoalRows(householdId, referenceMonth),
  ]);
  const budget = await calculateBudgetProjectionForPeriod(householdId, budgetItems, referenceMonth);

  // Mesmo critério do total do orçamento: item ativo e dentro do período (início, fim, pontual).
  const countedItems = budgetItems.filter(
    (item) =>
      item.isActive &&
      isBudgetItemActive(
        { kind: item.kind, amountMonthly: toDecimalNumber(item.amountMonthly), recurrence: item.recurrence, startMonth: item.startMonth, endMonth: item.endMonth },
        period,
      ),
  );
  const cardAmount = toMoneyNumber(budget.cardMovingAverageAppliedExpense);
  const cardAverage = toMoneyNumber(budget.cardMovingAverageExpense);

  return {
    referenceMonth: period.slice(0, 7),
    history,
    evolution,
    debts: flows.map((flow) => ({
      base: formatPeriod(flow.invoiceMonth).slice(0, 7),
      due: formatPeriod(flow.paymentMonth).slice(0, 7),
      personName: flow.person.name,
      cardName: flow.cardName,
      amount: toDecimalNumber(flow.amount),
      description: flow.description,
    })),
    budget: {
      items: countedItems.map((item) => ({
        kind: item.kind,
        name: item.name,
        personName: item.person?.name ?? null,
        amountMonthly: toDecimalNumber(item.amountMonthly),
        recurrence: item.recurrence,
        startMonth: formatPeriod(item.startMonth).slice(0, 7),
        endMonth: item.endMonth ? formatPeriod(item.endMonth).slice(0, 7) : null,
      })),
      // Como na página Orçamento: a linha do cartão só aparece quando a média entra de fato no total.
      card:
        budget.cardMovingAverageApplied && cardAmount > 0
          ? { amount: cardAmount, months: budget.cardMovingAverageMonths, partial: cardAmount < cardAverage - 0.005 }
          : null,
      totals: {
        income: toMoneyNumber(budget.incomeTotal),
        fixedExpense: toMoneyNumber(budget.fixedExpenseTotal),
        variableExpense: toMoneyNumber(budget.variableExpenseTotal),
        surplus: toMoneyNumber(budget.monthlySurplus),
      },
    },
    goals,
  };
}

/** Grava as abas num .xlsx: números com o formato de cada célula, larguras e filtro no cabeçalho. */
export function writeExportWorkbook(sheets: ExportSheet[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => row.map((cell) => (cell !== null && typeof cell === "object" ? cell.value : cell))));
    sheet.rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell !== null && typeof cell === "object") worksheet[XLSX.utils.encode_cell({ r, c })].z = cell.format;
      }),
    );
    worksheet["!cols"] = sheet.widths.map((wch) => ({ wch }));
    if (sheet.filterRows) {
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.filterRows - 1, c: sheet.rows[0].length - 1 } }) };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
