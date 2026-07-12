import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { BudgetManager } from "@/components/budget-manager";
import { MonthPager } from "@/components/month-pager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const [people, snapshots] = await Promise.all([
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.monthlySnapshot.findMany({
      where: { householdId, status: { in: ["closed", "revised"] } },
      select: { periodMonth: true },
      orderBy: { periodMonth: "asc" },
    }),
  ]);

  const periods = [...new Set(snapshots.map((snapshot) => snapshot.periodMonth.toISOString().slice(0, 10)))];
  const latest = periods.at(-1);
  const period = params.period_month ?? latest?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const current = `${period}-01`;
  if (!periods.includes(current)) {
    periods.push(current);
    periods.sort();
  }

  return (
    <>
      <PageHeader
        title="Orçamento"
        actions={<MonthPager current={current} periods={periods} basePath="/orcamento" />}
      />
      <PageBody>
        <BudgetManager people={people.map((person) => ({ id: person.id, name: person.name }))} period={period} />
      </PageBody>
    </>
  );
}
