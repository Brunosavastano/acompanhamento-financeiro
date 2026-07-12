import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { GoalManager } from "@/components/goal-manager";
import { MonthPager } from "@/components/month-pager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatPeriod } from "@/lib/date";
import { getGoalRows } from "@/server/metrics";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const snapshots = await prisma.monthlySnapshot.findMany({
    where: { householdId },
    orderBy: { periodMonth: "asc" },
    select: { periodMonth: true },
  });

  const periods = [...new Set(snapshots.map((snapshot) => formatPeriod(snapshot.periodMonth)))];
  const latest = periods.at(-1);
  const period = params.period_month ?? latest?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const current = `${period}-01`;
  if (!periods.includes(current)) {
    periods.push(current);
    periods.sort();
  }

  const goals = await getGoalRows(householdId, current);

  return (
    <>
      <PageHeader
        title="Metas da família"
        actions={<MonthPager current={current} periods={periods} basePath="/metas" prefix="Referência:" />}
      />
      <PageBody>
        <GoalManager key={period} period={period} initialGoals={goals} />
      </PageBody>
    </>
  );
}
