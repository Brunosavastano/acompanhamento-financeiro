import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type * as XLSXModule from "xlsx";
import { prisma } from "@/lib/prisma";
import { asMonthStart, formatPeriod, parseMonthOrNull } from "@/lib/date";
import { calculateSnapshotMetrics, rebuildGoalProgress } from "@/server/metrics";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof XLSXModule;

type SheetRow = unknown[];

export type BalanceteSourceRow = {
  periodMonth: Date;
  selicAnnual: number;
  expected: Record<string, number>;
};

export type ParsedDebtCashflow = {
  personId: string;
  invoiceMonth: Date;
  paymentMonth: Date;
  amount: number;
};

export type ParsedBudgetItem = ReturnType<typeof budgetItem>;

export type ParsedGoal = ReturnType<typeof parseGoals>[number];

const sheetAliases = {
  balancetes: ["Balancetes"],
  budget: ["Entradas_e_Sa\u00eddas_Mensais", "Entradas_e_Saidas_Mensais"],
  debts: ["D\u00edvidas", "Dividas"],
  goals: ["Metas"],
};

const accountMap = [
  { person: "Bruno", account: "Nubank", category: "cash" as const, column: 1 },
  { person: "Bruno", account: "VR", category: "benefit" as const, column: 2 },
  { person: "Bruno", account: "VA", category: "benefit" as const, column: 3 },
  { person: "Bruno", account: "Investimentos", category: "investment" as const, column: 4 },
  { person: "Bruno", account: "Cashback", category: "cashback" as const, column: 5 },
  { person: "Tatiane", account: "Caixa", category: "cash" as const, column: 9 },
  { person: "Tatiane", account: "Investimentos", category: "investment" as const, column: 10 },
];

export async function runExcelImport(input: { householdId: string; filePath: string }) {
  await fs.access(input.filePath);

  const job = await prisma.importJob.create({
    data: {
      householdId: input.householdId,
      fileName: path.basename(input.filePath),
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const workbook = await readWorkbookBuffer(input.filePath);

    const parsedWorkbook = parseWorkbook(workbook);
    const { balancetes, budgetRows, debtRows, goalRows, sourceRows } = parsedWorkbook;

    if (sourceRows.length === 0) throw new Error("Nenhum balancete mensal encontrado na planilha.");

    const earliestMonth = sourceRows[0].periodMonth;
    const latestMonth = sourceRows[sourceRows.length - 1].periodMonth;

    await prisma.$transaction(
      async (tx) => {
        const people = await tx.person.findMany({ where: { householdId: input.householdId }, include: { accounts: true } });
        const peopleByName = new Map(people.map((person) => [person.name.toLowerCase(), person]));
        const accountsByKey = new Map(
          people.flatMap((person) => person.accounts.map((account) => [`${person.name}:${account.name}`, account] as const)),
        );

        await tx.budgetItem.deleteMany({ where: { householdId: input.householdId } });
        await tx.goalProgressSnapshot.deleteMany({ where: { goal: { householdId: input.householdId } } });
        await tx.goal.deleteMany({ where: { householdId: input.householdId } });
        await tx.debtCashflow.deleteMany({ where: { householdId: input.householdId, source: "import" } });

        for (const row of sourceRows) {
          const snapshot = await tx.monthlySnapshot.upsert({
            where: {
              householdId_periodMonth_revisionNumber: {
                householdId: input.householdId,
                periodMonth: row.periodMonth,
                revisionNumber: 1,
              },
            },
            create: {
              householdId: input.householdId,
              periodMonth: row.periodMonth,
              status: "closed",
              selicAnnual: row.selicAnnual,
              closedAt: new Date(),
              revisionNumber: 1,
              notes: "Importado da planilha inicial.",
            },
            update: {
              status: "closed",
              selicAnnual: row.selicAnnual,
              closedAt: new Date(),
              notes: "Reimportado da planilha inicial.",
            },
          });

          await tx.position.deleteMany({ where: { snapshotId: snapshot.id, source: "import" } });

          for (const definition of accountMap) {
            const person = peopleByName.get(definition.person.toLowerCase());
            const account = accountsByKey.get(`${definition.person}:${definition.account}`);
            if (!person || !account) continue;
            const amount = toNumber(rowRawByPeriod(balancetes, row.periodMonth)?.[definition.column]);
            await tx.position.create({
              data: {
                snapshotId: snapshot.id,
                personId: person.id,
                accountId: account.id,
                category: definition.category,
                amount,
                source: "import",
              },
            });
          }

          await tx.interestRate.upsert({
            where: { householdId_periodMonth_rateType: { householdId: input.householdId, periodMonth: row.periodMonth, rateType: "selic_annual" } },
            create: {
              householdId: input.householdId,
              periodMonth: row.periodMonth,
              rateType: "selic_annual",
              annualRate: row.selicAnnual,
              source: "import",
            },
            update: {
              annualRate: row.selicAnnual,
              source: "import",
            },
          });
        }

        const debtCashflows = parseDebtCashflows(debtRows, peopleByName);
        if (debtCashflows.length) {
          await tx.debtCashflow.createMany({
            data: debtCashflows.map((flow) => ({
              householdId: input.householdId,
              personId: flow.personId,
              cardName: "Cartão principal",
              invoiceMonth: flow.invoiceMonth,
              paymentMonth: flow.paymentMonth,
              amount: flow.amount,
              description: "Parcela importada da matriz de dívidas",
              source: "import" as const,
            })),
          });
        }

        const budgetItems = parseBudgetItems(budgetRows, peopleByName, earliestMonth, input.householdId);
        if (budgetItems.length) await tx.budgetItem.createMany({ data: budgetItems });

        const goals = parseGoals(goalRows, input.householdId);
        for (const goal of goals) {
          const created = await tx.goal.create({ data: goal.goal });
          await tx.goalProgressSnapshot.create({
            data: {
              goalId: created.id,
              periodMonth: latestMonth,
              currentValue: goal.currentValue,
              progressPct: goal.progressPct,
              status: goal.progressPct >= 1 ? "achieved" : goal.progressPct < 0.5 ? "attention" : "in_progress",
            },
          });
        }
      },
      { maxWait: 15000, timeout: 120000 },
    );

    await reconcileImport(job.id, input.householdId, sourceRows);

    const latestMetrics = await calculateMetricsForGoalRebuild(input.householdId, latestMonth);
    await rebuildGoalProgress(input.householdId, latestMonth, latestMetrics);

    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date() },
    });

    return prisma.importJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { reconciliationRows: true },
    });
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function saveUploadToTemp(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const outputPath = path.join(process.cwd(), ".tmp", `${Date.now()}-${file.name}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return outputPath;
}

export function parseWorkbook(workbook: XLSXModule.WorkBook) {
  const balancetes = getRows(workbook, sheetAliases.balancetes);
  const budgetRows = getRows(workbook, sheetAliases.budget);
  const debtRows = getRows(workbook, sheetAliases.debts);
  const goalRows = getRows(workbook, sheetAliases.goals);
  const sourceRows = parseBalanceteRows(balancetes);

  return {
    balancetes,
    budgetRows,
    debtRows,
    goalRows,
    sourceRows,
  };
}

export function readWorkbook(filePath: string) {
  return XLSX.readFile(filePath, {
    cellDates: true,
    raw: true,
  });
}

async function readWorkbookBuffer(filePath: string) {
  const bytes = await fs.readFile(filePath);
  return XLSX.read(bytes, {
    type: "buffer",
    cellDates: true,
    raw: true,
  });
}

function getRows(workbook: XLSXModule.WorkBook, sheetNames: string[]): SheetRow[] {
  const sheetName = sheetNames.find((candidate) => workbook.Sheets[candidate]);
  if (!sheetName) throw new Error(`Aba '${sheetNames[0]}' não encontrada.`);
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as SheetRow[];
}

export function parseBalanceteRows(rows: SheetRow[]): BalanceteSourceRow[] {
  return rows
    .slice(3)
    .map((row) => {
      const periodMonth = toMonth(row[0]);
      if (!periodMonth) return null;
      return {
        periodMonth,
        selicAnnual: toNumber(row[14]),
        expected: {
          cashTotal: toNumber(row[15]),
          investmentsTotal: toNumber(row[16]),
          debtPvTotal: toNumber(row[17]),
          netWorth: toNumber(row[18]),
          monthlyVariation: toNumber(row[19]),
          assetsTotal: toNumber(row[21]),
          debtToAssets: toNumber(row[22]),
          reserveMonths: toNumber(row[23]),
          patrimonialSavingsRate: toNumber(row[24]),
        },
      };
    })
    .filter(Boolean) as BalanceteSourceRow[];
}

function rowRawByPeriod(rows: SheetRow[], periodMonth: Date) {
  const key = formatPeriod(periodMonth);
  return rows.find((row) => {
    const month = toMonth(row[0]);
    return month && formatPeriod(month) === key;
  });
}

export function parseDebtCashflows(rows: SheetRow[], peopleByName: Map<string, { id: string }>): ParsedDebtCashflow[] {
  return [
    ...parseDebtBlock(rows, 5, 6, 35, peopleByName.get("bruno")?.id),
    ...parseDebtBlock(rows, 39, 40, 69, peopleByName.get("tatiane")?.id),
  ];
}

function parseDebtBlock(rows: SheetRow[], headerRowIndex: number, firstPaymentRowIndex: number, lastPaymentRowIndex: number, personId?: string) {
  if (!personId) return [];
  const header = rows[headerRowIndex] ?? [];
  const invoiceMonths = header.slice(2, 16).map(toMonth);
  const flows: Array<{ personId: string; invoiceMonth: Date; paymentMonth: Date; amount: number }> = [];

  for (let rowIndex = firstPaymentRowIndex; rowIndex <= lastPaymentRowIndex; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const paymentMonth = toMonth(row[1]);
    if (!paymentMonth) continue;
    for (let offset = 0; offset < invoiceMonths.length; offset += 1) {
      const invoiceMonth = invoiceMonths[offset];
      const amount = toNumber(row[offset + 2]);
      if (!invoiceMonth || amount <= 0) continue;
      if (paymentMonth < invoiceMonth) continue;
      flows.push({ personId, invoiceMonth, paymentMonth, amount });
    }
  }
  return flows;
}

export function parseBudgetItems(rows: SheetRow[], peopleByName: Map<string, { id: string }>, startMonth: Date, householdId: string) {
  const items = [];
  let currentKind: "income" | "fixed_expense" | "variable_expense" | null = null;

  for (const row of rows) {
    const label = toText(row[1]);
    const normalizedLabel = normalizeText(label).toUpperCase();
    if (!label) continue;
    if (normalizedLabel.includes("RESUMO") || normalizedLabel.includes("NOTAS") || normalizedLabel.includes("COMO USAR")) break;
    if (normalizedLabel.includes("ENTRADAS")) {
      currentKind = "income";
      continue;
    }
    if (normalizedLabel.includes("SAIDAS FIXAS")) {
      currentKind = "fixed_expense";
      continue;
    }
    if (normalizedLabel.includes("SAIDAS VARIAVEIS")) {
      currentKind = "variable_expense";
      continue;
    }
    if (!currentKind || normalizedLabel === "DESCRICAO" || normalizedLabel.startsWith("TOTAL") || normalizedLabel.startsWith("SUBTOTAL")) continue;

    const bruno = toNumber(row[2]);
    const tatiane = toNumber(row[3]);
    const total = toNumber(row[4]);
    const brunoId = peopleByName.get("bruno")?.id;
    const tatianeId = peopleByName.get("tatiane")?.id;

    if (currentKind === "income") {
      if (bruno > 0 && brunoId) items.push(budgetItem(householdId, brunoId, label, currentKind, bruno, startMonth));
      if (tatiane > 0 && tatianeId) items.push(budgetItem(householdId, tatianeId, label, currentKind, tatiane, startMonth));
      if (bruno === 0 && tatiane === 0 && total > 0) items.push(budgetItem(householdId, null, label, currentKind, total, startMonth));
      continue;
    }

    if (bruno > 0 && brunoId) items.push(budgetItem(householdId, brunoId, label, currentKind, bruno, startMonth));
    if (tatiane > 0 && tatianeId) items.push(budgetItem(householdId, tatianeId, label, currentKind, tatiane, startMonth));
    if ((bruno === 0 && tatiane === 0) || total !== bruno + tatiane) {
      if (total > 0) items.push(budgetItem(householdId, null, label, currentKind, total, startMonth));
    }
  }

  return items;
}

function budgetItem(householdId: string, personId: string | null, name: string, kind: "income" | "fixed_expense" | "variable_expense", amountMonthly: number, startMonth: Date) {
  return {
    householdId,
    personId,
    name,
    kind,
    amountMonthly,
    recurrence: "monthly" as const,
    startMonth,
    isActive: true,
  };
}

export function parseGoals(rows: SheetRow[], householdId: string) {
  const goals = [];
  let horizon: "short" | "medium" | "long" = "short";

  for (const row of rows.slice(5)) {
    const title = toText(row[1]);
    const normalizedTitle = normalizeText(title).toUpperCase();
    if (!title) continue;
    if (
      normalizedTitle.includes("PAINEL RESUMO") ||
      normalizedTitle.includes("PROJECAO PATRIMONIAL") ||
      normalizedTitle.includes("COMO USAR")
    ) {
      break;
    }
    if (normalizedTitle.includes("CURTO")) {
      horizon = "short";
      continue;
    }
    if (normalizedTitle.includes("MEDIO")) {
      horizon = "medium";
      continue;
    }
    if (normalizedTitle.includes("LONGO")) {
      horizon = "long";
      continue;
    }

    const indicator = toText(row[2]);
    if (!indicator || indicator === "INDICADOR") continue;
    const target = row[3];
    const current = row[4];
    const progressPct = clamp(toNumber(row[5]), 0, 1);
    const isTargetNumeric = isFiniteNumber(target);
    const operator = inferGoalOperator(title, indicator, target);
    const targetMonth = parseMonthOrNull(row[6] instanceof Date ? row[6] : toText(row[6]));

    goals.push({
      goal: {
        householdId,
        title,
        horizon,
        metricKey: metricKey(indicator),
        targetValueDecimal: isTargetNumeric ? toNumber(target) : null,
        targetValueText: isTargetNumeric ? null : toText(target),
        targetDate: targetMonth ? formatPeriod(targetMonth) : toText(row[6]) || null,
        comparisonOperator: operator,
        riskCapValue: operator === "less_or_equal" && isTargetNumeric ? toNumber(target) * 2 : null,
        manualCurrentValue: operator === "manual" ? toText(current) || String(toNumber(current)) : null,
        notes: toText(row[7]) || null,
      },
      currentValue: toText(current) || String(toNumber(current)),
      progressPct,
    });
  }

  return goals;
}

async function reconcileImport(importJobId: string, householdId: string, sourceRows: BalanceteSourceRow[]) {
  await prisma.importReconciliationRow.deleteMany({ where: { importJobId } });

  for (const row of sourceRows) {
    const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({
      where: { householdId, periodMonth: row.periodMonth },
      orderBy: { revisionNumber: "desc" },
    });
    const metrics = await calculateSnapshotMetrics(householdId, snapshot.id);
    const actuals = {
      cashTotal: metrics.kpis.cashTotal,
      investmentsTotal: metrics.kpis.investmentsTotal,
      debtPvTotal: metrics.kpis.debtPvTotal,
      netWorth: metrics.kpis.netWorth,
      monthlyVariation: metrics.kpis.monthlyVariation,
      assetsTotal: metrics.kpis.assetsTotal,
      debtToAssets: metrics.kpis.debtToAssets,
      reserveMonths: metrics.kpis.reserveMonths,
      patrimonialSavingsRate: metrics.kpis.patrimonialSavingsRate,
    };

    for (const [metricKey, spreadsheetValue] of Object.entries(row.expected)) {
      const appValue = actuals[metricKey as keyof typeof actuals];
      const tolerance = metricKey.includes("Rate") || metricKey.includes("Assets") || metricKey === "reserveMonths" ? 0.0001 : 0.01;
      const delta = appValue - spreadsheetValue;
      await prisma.importReconciliationRow.create({
        data: {
          importJobId,
          snapshotId: snapshot.id,
          periodMonth: row.periodMonth,
          metricKey,
          spreadsheetValue,
          appValue,
          delta,
          tolerance,
          passed: Math.abs(delta) <= tolerance,
        },
      });
    }
  }
}

async function calculateMetricsForGoalRebuild(householdId: string, periodMonth: Date) {
  const snapshot = await prisma.monthlySnapshot.findFirstOrThrow({
    where: { householdId, periodMonth },
    orderBy: { revisionNumber: "desc" },
  });
  const metrics = await calculateSnapshotMetrics(householdId, snapshot.id);
  return {
    meses_de_reserva: metrics.kpis.reserveMonths,
    invest_ativos: metrics.kpis.investmentsToAssets,
    divida_ativos: metrics.kpis.debtToAssets,
    tx_poupanca: metrics.kpis.patrimonialSavingsRate,
    pl_total: metrics.kpis.netWorth,
    invest_total: metrics.kpis.investmentsTotal,
    caixa_total: metrics.kpis.cashTotal,
  };
}

function inferGoalOperator(title: string, indicator: string, target: unknown) {
  if (!isFiniteNumber(target)) return "manual" as const;
  const text = normalizeText(`${title} ${indicator}`).toLowerCase();
  if (text.includes("<") || text.includes("divida")) return "less_or_equal" as const;
  return "greater_or_equal" as const;
}

function metricKey(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toMonth(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return asMonthStart(value);
  if (typeof value === "number" && value > 20000) {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return new Date(Date.UTC(date.y, date.m - 1, 1));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return asMonthStart(parsed);
  }
  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isFiniteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") return Number.isFinite(Number(value.replace(",", ".")));
  return false;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatPeriod(value);
  return String(value).trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
