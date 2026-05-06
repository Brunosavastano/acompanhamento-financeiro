import { PageHeader } from "@/components/page-header";
import { BalanceSheetManager } from "@/components/balance-sheet-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { getSnapshotHistory } from "@/server/metrics";

export default async function BalancetesPage() {
  const householdId = await getRequiredPageHouseholdId();
  const history = await getSnapshotHistory(householdId);

  return (
    <>
      <PageHeader title="Balancetes" description="Historico mensal normalizado a partir dos snapshots fechados e revisoes." />
      <BalanceSheetManager history={history} />
    </>
  );
}
