import { PageHeader } from "@/components/page-header";
import { PageBody } from "@/components/ui";
import { BalanceSheetManager } from "@/components/balance-sheet-manager";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { getSnapshotHistory } from "@/server/metrics";

export default async function BalancetesPage() {
  const householdId = await getRequiredPageHouseholdId();
  const history = await getSnapshotHistory(householdId);
  const closedCount = history.filter((row) => row.status === "closed").length;
  const revisedCount = history.filter((row) => row.status === "revised").length;

  return (
    <>
      <PageHeader
        title="Histórico mensal"
        actions={
          history.length > 0 ? (
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-positive" aria-hidden />
                {closedCount} {closedCount === 1 ? "mês fechado" : "meses fechados"}
              </span>
              {revisedCount > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
                  {revisedCount} {revisedCount === 1 ? "revisão" : "revisões"}
                </span>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <PageBody>
        <BalanceSheetManager history={history} />
      </PageBody>
    </>
  );
}
