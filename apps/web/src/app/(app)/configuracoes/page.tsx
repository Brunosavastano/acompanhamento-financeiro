import { PageHeader } from "@/components/page-header";
import { SettingsManager } from "@/components/settings-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function ConfiguracoesPage() {
  const householdId = await getRequiredPageHouseholdId();
  const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId } });
  const people = await prisma.person.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      role: true,
      accounts: {
        select: { id: true, personId: true, name: true, accountType: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Configuracoes" description="Cadastro base da familia, pessoas e contas usadas nos fechamentos mensais." />
      <SettingsManager
        household={{ name: household.name, baseCurrency: household.baseCurrency }}
        initialPeople={people}
      />
    </>
  );
}
