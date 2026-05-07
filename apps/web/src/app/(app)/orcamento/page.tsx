import { PageHeader } from "@/components/page-header";
import { BudgetManager } from "@/components/budget-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const people = await prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Orçamento" description="Entradas, despesas fixas, variáveis, sobra mensal e comprometimento de renda." />
      <BudgetManager people={people.map((person) => ({ id: person.id, name: person.name }))} defaultPeriod={params.period_month} />
    </>
  );
}
