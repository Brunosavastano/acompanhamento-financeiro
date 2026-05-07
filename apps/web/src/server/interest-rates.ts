import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaLike = typeof prisma | Prisma.TransactionClient;
type SelicSource = "manual" | "external_api" | "import";

const BACEN_SELIC_META_SERIES_ID = 432;
const BACEN_API_TIMEOUT_MS = 7000;

export async function getDefaultSelicAnnual(householdId: string, periodMonth?: Date) {
  if (periodMonth) {
    const resolved = await resolveSelicAnnualForPeriod(householdId, periodMonth);
    return resolved.annualRate;
  }

  const [latestRate, latestSnapshot] = await Promise.all([
    prisma.interestRate.findFirst({
      where: { householdId, rateType: "selic_annual" },
      orderBy: { periodMonth: "desc" },
      select: { annualRate: true },
    }),
    prisma.monthlySnapshot.findFirst({
      where: { householdId },
      orderBy: { periodMonth: "desc" },
      select: { selicAnnual: true },
    }),
  ]);

  return String(latestRate?.annualRate ?? latestSnapshot?.selicAnnual ?? "0.15");
}

export async function resolveSelicAnnualForPeriod(householdId: string, periodMonth: Date, manualAnnualRate?: number | string | null) {
  if (manualAnnualRate !== undefined && manualAnnualRate !== null) {
    return {
      annualRate: String(manualAnnualRate),
      source: "manual" as SelicSource,
      providerDate: null as string | null,
      fallback: false,
    };
  }

  const bacenRate = await fetchBacenSelicMetaAnnual(periodMonth).catch(() => null);
  if (bacenRate) {
    return {
      annualRate: bacenRate.annualRate,
      source: "external_api" as SelicSource,
      providerDate: bacenRate.providerDate,
      fallback: false,
    };
  }

  const [latestRate, latestSnapshot] = await Promise.all([
    prisma.interestRate.findFirst({
      where: { householdId, rateType: "selic_annual" },
      orderBy: { periodMonth: "desc" },
      select: { annualRate: true, source: true },
    }),
    prisma.monthlySnapshot.findFirst({
      where: { householdId },
      orderBy: { periodMonth: "desc" },
      select: { selicAnnual: true },
    }),
  ]);

  return {
    annualRate: String(latestRate?.annualRate ?? latestSnapshot?.selicAnnual ?? "0.15"),
    source: (latestRate?.source ?? "manual") as SelicSource,
    providerDate: null as string | null,
    fallback: true,
  };
}

export async function fetchBacenSelicMetaAnnual(periodMonth: Date) {
  const finalDate = minDate(endOfUtcMonth(periodMonth), new Date());
  const initialDate = addUtcDays(finalDate, -370);
  const url = new URL(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BACEN_SELIC_META_SERIES_ID}/dados`);
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", formatBacenDate(initialDate));
  url.searchParams.set("dataFinal", formatBacenDate(finalDate));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACEN_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Bacen SGS returned ${response.status}`);
    const rows = (await response.json()) as Array<{ data?: string; valor?: string }>;
    const latest = rows
      .filter((row) => row.data && row.valor)
      .at(-1);
    if (!latest?.data || !latest.valor) return null;

    const percentage = Number(latest.valor.replace(",", "."));
    if (!Number.isFinite(percentage)) return null;
    return {
      annualRate: (percentage / 100).toFixed(8),
      providerDate: latest.data,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function upsertSelicRate(
  db: PrismaLike,
  input: { householdId: string; periodMonth: Date; annualRate: Prisma.Decimal | number | string; source: SelicSource },
) {
  const where = {
    householdId_periodMonth_rateType: {
      householdId: input.householdId,
      periodMonth: input.periodMonth,
      rateType: "selic_annual" as const,
    },
  };
  const previous = await db.interestRate.findUnique({ where });
  const rate = await db.interestRate.upsert({
    where,
    create: {
      householdId: input.householdId,
      periodMonth: input.periodMonth,
      rateType: "selic_annual",
      annualRate: input.annualRate,
      source: input.source,
    },
    update: {
      annualRate: input.annualRate,
      source: input.source,
    },
  });

  return {
    previous,
    rate,
    changed: !previous || Number(previous.annualRate) !== Number(input.annualRate) || previous.source !== input.source,
  };
}

export async function upsertManualSelicRate(db: PrismaLike, input: { householdId: string; periodMonth: Date; annualRate: Prisma.Decimal | number | string }) {
  return upsertSelicRate(db, { ...input, source: "manual" });
}

function endOfUtcMonth(periodMonth: Date) {
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 0));
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function formatBacenDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}
