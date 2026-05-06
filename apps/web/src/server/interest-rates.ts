import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export async function getDefaultSelicAnnual(householdId: string) {
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

export async function upsertManualSelicRate(db: PrismaLike, input: { householdId: string; periodMonth: Date; annualRate: Prisma.Decimal | number | string }) {
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
      source: "manual",
    },
    update: {
      annualRate: input.annualRate,
      source: "manual",
    },
  });

  return {
    previous,
    rate,
    changed: !previous || Number(previous.annualRate) !== Number(input.annualRate) || previous.source !== "manual",
  };
}
