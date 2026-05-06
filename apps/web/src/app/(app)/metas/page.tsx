import { PageHeader } from "@/components/page-header";
import { GoalManager } from "@/components/goal-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatPeriod } from "@/lib/date";
import { getGoalRows } from "@/server/metrics";

export default async function MetasPage() {
  const householdId = await getRequiredPageHouseholdId();
  const [snapshots, latestSnapshot] = await Promise.all([
    prisma.monthlySnapshot.findMany({
      where: { householdId },
      orderBy: [{ periodMonth: "asc" }, { revisionNumber: "desc" }],
      select: { periodMonth: true, status: true },
    }),
    prisma.monthlySnapshot.findFirst({
      where: { householdId },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
    }),
  ]);
  const defaultPeriod = formatPeriod(latestSnapshot?.periodMonth ?? new Date());
  const goals = await getGoalRows(householdId, defaultPeriod);

  return (
    <>
      <PageHeader title="Metas" description="Metas quantitativas, metas inversas e progresso qualitativo manual." />
      <GoalManager
        availablePeriods={snapshots.map((snapshot) => ({
          periodMonth: formatPeriod(snapshot.periodMonth),
          status: snapshot.status,
        }))}
        defaultPeriod={defaultPeriod.slice(0, 7)}
        initialGoals={goals}
      />
    </>
  );
}
