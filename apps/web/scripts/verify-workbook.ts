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
  process.argv[2] ??
  process.env.DEFAULT_EXCEL_PATH ??
  "G:/Meu Drive/Seagate/Pessoal/Documentos/Financeiro/Plan_Fin_melhorada_claudeV2.xlsx";

const workbook = readWorkbook(workbookPath);
const parsed = parseWorkbook(workbook);
const peopleByName = new Map([
  ["bruno", { id: "bruno" }],
  ["tatiane", { id: "tatiane" }],
]);

const may2026 = parsed.sourceRows.find((row) => formatPeriod(row.periodMonth) === "2026-05-01");
if (!may2026) {
  throw new Error("Maio/2026 não encontrado em Balancetes.");
}

const cashflows = parseDebtCashflows(parsed.debtRows, peopleByName).filter(
  (flow) => formatPeriod(flow.invoiceMonth) === "2026-05-01",
);
const debt = calculateDebtMetrics(cashflows, may2026.selicAnnual, "2026-05-01");

const budgetItems = parseBudgetItems(parsed.budgetRows, peopleByName, parsed.sourceRows[0].periodMonth, "household");
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

const checks = [
  check("PL total", may2026.expected.netWorth, 275223.18, 0.01),
  check("Caixa total", may2026.expected.cashTotal, 184408.62, 0.01),
  check("Investimentos", may2026.expected.investmentsTotal, 140124.1, 0.01),
  check("Dívida PV planilha", may2026.expected.debtPvTotal, 49309.54, 0.01),
  check("Dívida PV recalculada", toMoneyNumber(debt.presentValueTotal), 49309.54, 0.01),
  check("Receita orçamento", toMoneyNumber(budget.incomeTotal), 57096.5, 0.01),
  check("Despesa orçamento", toMoneyNumber(budget.expenseTotal), 37163.66, 0.01),
];

console.table(
  checks.map((row) => ({
    métrica: row.name,
    valor: row.actual,
    esperado: row.expected,
    delta: row.delta,
    ok: row.passed,
  })),
);
console.log(`Snapshots: ${parsed.sourceRows.length}`);
console.log(`Cashflows maio/2026: ${cashflows.length}`);
console.log(`Itens de orçamento: ${budgetItems.length}`);
console.log(`Metas: ${goals.length}`);

const failed = checks.filter((row) => !row.passed);
if (failed.length) {
  process.exitCode = 1;
}

function check(name: string, actual: number, expected: number, tolerance: number) {
  const delta = Number((actual - expected).toFixed(6));
  return {
    name,
    actual,
    expected,
    delta,
    passed: Math.abs(delta) <= tolerance,
  };
}
