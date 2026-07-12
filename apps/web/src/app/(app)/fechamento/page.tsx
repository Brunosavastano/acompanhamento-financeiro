import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { MonthlyCloseWizard } from "@/components/monthly-close-wizard";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { nextMonth } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { getDefaultSelicAnnual } from "@/server/interest-rates";

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const { snapshot } = await searchParams;
  const [latest, accounts] = await Promise.all([
    prisma.monthlySnapshot.findFirst({
      where: { householdId, status: { in: ["closed", "revised"] } },
      orderBy: { periodMonth: "desc" },
    }),
    prisma.account.findMany({
      where: { person: { householdId }, isActive: true },
      include: { person: true },
      orderBy: [{ person: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  const defaultDate = latest
    ? nextMonth(latest.periodMonth)
    : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
  const defaultSelicAnnual = await getDefaultSelicAnnual(
    householdId,
    defaultDate,
  );

  return (
    <>
      <PageHeader
        title="Fechar o mês"
        description="Quatro passos: mês e Selic, saldos por conta, revisão e fechamento."
      />
      <PageBody>
        <MonthlyCloseWizard
          defaultPeriod={defaultDate.toISOString().slice(0, 10)}
          defaultSelicAnnual={defaultSelicAnnual}
          initialSnapshotId={snapshot}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            accountType: account.accountType,
            personId: account.personId,
            person: { id: account.person.id, name: account.person.name },
          }))}
        />
      </PageBody>
    </>
  );
}
