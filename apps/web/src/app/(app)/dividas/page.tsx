import { PageHeader } from "@/components/page-header";
import { DebtManager } from "@/components/debt-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function DividasPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const [people, latest] = await Promise.all([
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.monthlySnapshot.findFirst({ where: { householdId }, orderBy: { periodMonth: "desc" } }),
  ]);
  const defaultPeriod = params.period_month ?? (latest?.periodMonth ?? new Date()).toISOString().slice(0, 7);

  return (
    <>
      <PageHeader title="Dividas" description="Fluxos futuros de parcelas, fatura do mes, valor presente descontado pela Selic e ganho de float." />
      <DebtManager
        people={people.map((person) => ({ id: person.id, name: person.name }))}
        defaultPeriod={defaultPeriod}
      />
    </>
  );
}
