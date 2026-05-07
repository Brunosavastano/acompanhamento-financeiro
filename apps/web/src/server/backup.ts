import { prisma } from "@/lib/prisma";
import { getHouseholdAuditLogs } from "@/server/audit-scope";
import { visibleGoalWhere } from "@/server/goal-scope";

export const csvDatasets = [
  { key: "household", label: "Família" },
  { key: "persons", label: "Pessoas" },
  { key: "accounts", label: "Contas" },
  { key: "snapshots", label: "Snapshots" },
  { key: "positions", label: "Posições" },
  { key: "debtCashflows", label: "Dívidas" },
  { key: "budgetItems", label: "Orçamento" },
  { key: "goals", label: "Metas" },
  { key: "goalProgressSnapshots", label: "Progresso das metas" },
  { key: "interestRates", label: "Taxas" },
  { key: "importJobs", label: "Importações" },
  { key: "importReconciliationRows", label: "Reconciliação" },
  { key: "auditLogs", label: "Auditoria" },
] as const;

export type CsvDatasetKey = (typeof csvDatasets)[number]["key"];

export async function getBackupData(householdId: string) {
  const [
    household,
    persons,
    accounts,
    snapshots,
    positions,
    debtCashflows,
    budgetItems,
    goals,
    goalProgressSnapshots,
    interestRates,
    importJobs,
    importReconciliationRows,
    auditLogs,
  ] = await Promise.all([
    prisma.household.findUnique({ where: { id: householdId } }),
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { person: { householdId } }, orderBy: { name: "asc" } }),
    prisma.monthlySnapshot.findMany({ where: { householdId }, orderBy: [{ periodMonth: "asc" }, { revisionNumber: "asc" }] }),
    prisma.position.findMany({ where: { snapshot: { householdId } }, orderBy: { createdAt: "asc" } }),
    prisma.debtCashflow.findMany({ where: { householdId }, orderBy: [{ invoiceMonth: "asc" }, { paymentMonth: "asc" }] }),
    prisma.budgetItem.findMany({ where: { householdId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.goal.findMany({ where: visibleGoalWhere(householdId), orderBy: [{ horizon: "asc" }, { createdAt: "asc" }] }),
    prisma.goalProgressSnapshot.findMany({ where: { goal: visibleGoalWhere(householdId) }, orderBy: [{ periodMonth: "asc" }] }),
    prisma.interestRate.findMany({ where: { householdId }, orderBy: [{ periodMonth: "asc" }, { rateType: "asc" }] }),
    prisma.importJob.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    prisma.importReconciliationRow.findMany({ where: { importJob: { householdId } }, orderBy: [{ periodMonth: "asc" }, { metricKey: "asc" }] }),
    getHouseholdAuditLogs(householdId, 5000),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    household,
    persons,
    accounts,
    snapshots,
    positions,
    debtCashflows,
    budgetItems,
    goals,
    goalProgressSnapshots,
    interestRates,
    importJobs,
    importReconciliationRows,
    auditLogs,
  };
}

export function isCsvDatasetKey(value: string | null): value is CsvDatasetKey {
  return csvDatasets.some((dataset) => dataset.key === value);
}

export function backupDatasetRows(data: Awaited<ReturnType<typeof getBackupData>>, dataset: CsvDatasetKey) {
  if (dataset === "household") return data.household ? [data.household] : [];
  return data[dataset] as unknown[];
}

export function toCsv(rows: unknown[]) {
  const flattened = rows.map((row) => flattenObject(row));
  const columns = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
  const header = columns.map(escapeCsv).join(",");
  const body = flattened.map((row) => columns.map((column) => escapeCsv(row[column] ?? "")).join(","));
  return [header, ...body].join("\r\n");
}

function flattenObject(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const output: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (rawValue && typeof rawValue === "object" && !(rawValue instanceof Date) && !Array.isArray(rawValue) && !hasScalarSerializer(rawValue)) {
      Object.assign(output, flattenObject(rawValue, nextKey));
    } else {
      output[nextKey] = serializeValue(rawValue);
    }
  }
  return output;
}

function hasScalarSerializer(value: object) {
  return "toNumber" in value;
}

function serializeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return String(value.toNumber());
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value: string) {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
