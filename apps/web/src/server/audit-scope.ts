import { prisma } from "@/lib/prisma";

export async function getHouseholdAuditLogs(householdId: string, take = 200) {
  const entityIds = await getHouseholdAuditEntityIds(householdId);
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { user: { householdId } },
        { entityId: { in: entityIds } },
      ],
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

async function getHouseholdAuditEntityIds(householdId: string) {
  const [
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
    reconciliationRows,
  ] = await Promise.all([
    prisma.person.findMany({ where: { householdId }, select: { id: true } }),
    prisma.account.findMany({ where: { person: { householdId } }, select: { id: true } }),
    prisma.monthlySnapshot.findMany({ where: { householdId }, select: { id: true } }),
    prisma.position.findMany({ where: { snapshot: { householdId } }, select: { id: true } }),
    prisma.debtCashflow.findMany({ where: { householdId }, select: { id: true } }),
    prisma.budgetItem.findMany({ where: { householdId }, select: { id: true } }),
    prisma.goal.findMany({ where: { householdId }, select: { id: true } }),
    prisma.goalProgressSnapshot.findMany({ where: { goal: { householdId } }, select: { id: true } }),
    prisma.interestRate.findMany({ where: { householdId }, select: { id: true } }),
    prisma.importJob.findMany({ where: { householdId }, select: { id: true } }),
    prisma.importReconciliationRow.findMany({ where: { importJob: { householdId } }, select: { id: true } }),
  ]);

  return [
    householdId,
    ...persons.map((item) => item.id),
    ...accounts.map((item) => item.id),
    ...snapshots.map((item) => item.id),
    ...positions.map((item) => item.id),
    ...debtCashflows.map((item) => item.id),
    ...budgetItems.map((item) => item.id),
    ...goals.map((item) => item.id),
    ...goalProgressSnapshots.map((item) => item.id),
    ...interestRates.map((item) => item.id),
    ...importJobs.map((item) => item.id),
    ...reconciliationRows.map((item) => item.id),
  ];
}
