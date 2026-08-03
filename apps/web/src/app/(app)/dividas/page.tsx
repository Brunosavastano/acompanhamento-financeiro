import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { DebtManager } from "@/components/debt-manager";
import { MonthPager } from "@/components/month-pager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { asMonthStart, formatPeriod, nextMonth } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { isVisionReaderAvailable } from "@/server/ai";

export default async function DividasPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const [people, snapshots] = await Promise.all([
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.monthlySnapshot.findMany({
      where: { householdId },
      select: { periodMonth: true, status: true },
      orderBy: [{ periodMonth: "asc" }, { revisionNumber: "asc" }],
    }),
  ]);

  // Status da ÚLTIMA revisão de cada mês (ordenação asc faz a última sobrescrever).
  const statusByPeriod = new Map<string, string>();
  for (const snapshot of snapshots) statusByPeriod.set(formatPeriod(snapshot.periodMonth), snapshot.status);

  // A base padrão é o mês EM ABERTO (seguinte ao último fechamento): bases de
  // meses fechados são história imutável e ficam somente leitura.
  const lockedPeriods = [...statusByPeriod.entries()].filter(([, status]) => status !== "draft").map(([key]) => key);
  const latestLocked = lockedPeriods.at(-1);
  const openPeriod = latestLocked ? formatPeriod(nextMonth(asMonthStart(latestLocked))) : formatPeriod(new Date());

  const periods = [...new Set([...statusByPeriod.keys(), openPeriod])].sort();
  const period = params.period_month ?? openPeriod.slice(0, 7);
  const current = `${period}-01`;
  if (!periods.includes(current)) {
    periods.push(current);
    periods.sort();
  }
  const baseStatus = statusByPeriod.get(current);
  const baseLocked = baseStatus === "closed" || baseStatus === "revised";

  return (
    <>
      <PageHeader
        title="Cartão e dívidas"
        actions={<MonthPager current={current} periods={periods} basePath="/dividas" prefix="Base:" />}
      />
      <PageBody>
        <DebtManager
          people={people.map((person) => ({ id: person.id, name: person.name }))}
          period={period}
          aiReaderAvailable={isVisionReaderAvailable()}
          baseLocked={baseLocked}
        />
      </PageBody>
    </>
  );
}
