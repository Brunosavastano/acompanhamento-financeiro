import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { SettingsManager } from "@/components/settings-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function ConfiguracoesPage() {
  const householdId = await getRequiredPageHouseholdId();
  const [household, people, firstSnapshot] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    prisma.person.findMany({
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
    }),
    prisma.monthlySnapshot.findFirst({
      where: { householdId, status: { in: ["closed", "revised"] } },
      orderBy: { periodMonth: "asc" },
      select: { periodMonth: true },
    }),
  ]);

  const dataSince = firstSnapshot
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstSnapshot.periodMonth)
    : null;

  return (
    <>
      <PageHeader
        title="Configurações"
        actions={
          <span className="text-xs text-muted">
            {household.name} · moeda {household.baseCurrency}
          </span>
        }
      />
      <PageBody>
        <SettingsManager
          household={{ name: household.name, baseCurrency: household.baseCurrency }}
          initialPeople={people}
          dataSince={dataSince}
        />
      </PageBody>
    </>
  );
}
