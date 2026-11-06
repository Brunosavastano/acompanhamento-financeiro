import { notFound } from "next/navigation";
import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { currency, percent } from "@/lib/format";
import { asMonthStart } from "@/lib/date";
import { FAMILY_SCOPE, averageMonthlyChange, debtRows, latestComposition, monthGap, monthlyChanges, summaryRows } from "@/lib/evolution";
import { explain, nominalDebtNote } from "@/lib/explanations";
import { buildMonthInsights } from "@/lib/insights";
import { getPersonPageData } from "@/server/evolution";
import { CompositionPanel, HeroSparkline, VariationPanel } from "@/components/dashboard-panels";
import { AccountsTable, DebtEvolutionPanel, EvolutionExplorer } from "@/components/evolution-panels";
import { InfoTip } from "@/components/info-tip";
import { MonthInsightsPanel } from "@/components/month-insights";
import { EmptyState, MiniKpi, PageBody } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MonthPager } from "@/components/month-pager";

// Formatação local: funções exportadas por módulos "use client" não rodam no servidor.
function monthName(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(asMonthStart(month));
}

/** "2026-10" → "out/26" */
function monthShort(month: string) {
  const date = asMonthStart(month);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${label}/${String(date.getUTCFullYear()).slice(2)}`;
}

function brl0(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function signedBrl0(value: number) {
  return `${value >= 0 ? "+" : "-"}${brl0(Math.abs(value))}`;
}

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const [{ personId }, { period_month: requestedPeriod }] = await Promise.all([params, searchParams]);
  const data = await getPersonPageData(householdId, personId, requestedPeriod);
  if (!data) notFound();

  const { person, periods, periodMonth, evolution } = data;
  const firstName = person.name.split(" ")[0];

  if (!evolution || !periodMonth || evolution.months.length === 0) {
    return (
      <>
        <PageHeader title={person.name} />
        <PageBody>
          <EmptyState
            title="Nenhum fechamento encontrado"
            description="Os saldos de cada pessoa aparecem aqui depois do primeiro mês fechado."
          />
        </PageBody>
      </>
    );
  }

  // Mesmas fronteiras do dashboard: VR/VA dentro de caixa, cashback dentro de
  // investimentos e dívida a valor presente. A soma das pessoas dá a família.
  const rows = summaryRows(evolution, person.id);
  const current = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const changes = monthlyChanges(rows);
  const average = averageMonthlyChange(changes, 12);
  const familyRows = summaryRows(evolution, FAMILY_SCOPE);
  const family = familyRows[familyRows.length - 1];
  const share = family && family.patrimonio > 0 && current.patrimonio > 0 ? current.patrimonio / family.patrimonio : null;
  const gap = previous ? monthGap(previous.month, current.month) : 1;
  const sinceCaption = previous ? (gap > 1 ? `desde ${monthShort(previous.month)}` : "no mês") : "primeiro mês";
  const delta = (key: "caixa" | "investimentos" | "dividas") => (previous ? current[key] - previous[key] : null);

  const netWorthText = currency(current.patrimonio);
  const decimalsAt = netWorthText.lastIndexOf(",");
  const variation = previous ? current.patrimonio - previous.patrimonio : null;
  const composition = latestComposition(evolution, person.id);
  // Mesma variação do selo do topo: o texto nunca diverge do card.
  const insights = buildMonthInsights({ evolution, scope: person.id, netWorth: { value: current.patrimonio, change: variation } });
  const personDebts = debtRows(evolution, person.id);

  return (
    <>
      <PageHeader
        title={person.name}
        actions={<MonthPager current={periodMonth} periods={periods} basePath={`/pessoas/${person.id}`} />}
      />
      <PageBody>
        <MonthInsightsPanel insights={insights} family={false} />

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="relative min-w-0 overflow-hidden rounded-[14px] border border-edge bg-[linear-gradient(160deg,#101A30_0%,#0E1526_55%)] p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Patrimônio líquido de{" "}
                  <span className="whitespace-nowrap">
                    {firstName}
                    <InfoTip explanation={explain("patrimonio")} className="-my-1 ml-1" />
                  </span>
                </div>
                <div className="mt-2.5 whitespace-nowrap text-[clamp(30px,3vw,44px)] font-semibold tracking-[-0.02em] tabular-nums text-snow">
                  {decimalsAt >= 0 ? (
                    <>
                      {netWorthText.slice(0, decimalsAt)}
                      <span className="text-[26px] text-muted">{netWorthText.slice(decimalsAt)}</span>
                    </>
                  ) : (
                    netWorthText
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {variation !== null && previous ? (
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                        variation >= 0 ? "bg-positive/[0.12] text-positive-text" : "bg-negative/[0.12] text-negative-text",
                      )}
                    >
                      {variation >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      )}
                      {signedBrl0(variation)} {gap > 1 ? `desde ${monthName(previous.month)} (${gap} meses)` : `em ${monthName(current.month)}`}
                    </span>
                  ) : null}
                  {variation !== null && previous && previous.patrimonio > 0 ? (
                    <span className="text-xs text-faint">
                      {variation >= 0 ? "+" : ""}
                      {percent(variation / previous.patrimonio, 1)} sobre {monthName(previous.month)}
                    </span>
                  ) : null}
                  {average ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-info/[0.12] px-2.5 py-1 text-xs font-semibold text-info-text">
                      <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      {signedBrl0(average.value)}/mês em média · últimos {average.months} meses
                    </span>
                  ) : null}
                </div>
              </div>
              {share !== null ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-edge bg-night/50 px-3 py-[5px] text-[11px] font-semibold text-muted">
                  {percent(share, 0)} da família
                </span>
              ) : null}
            </div>
            <HeroSparkline data={rows.slice(-12).map((row) => ({ month: row.month, value: row.patrimonio }))} />
          </section>

          <div className="grid min-w-0 gap-4 lg:grid-rows-3">
            {(
              [
                ["caixa", "Caixa disponível"],
                ["investimentos", "Investimentos"],
                ["dividas", "Dívidas do cartão"],
              ] as const
            ).map(([key, label]) => {
              const change = delta(key);
              // Para dívidas, subir é ruim.
              const good = change === null || change === 0 ? null : key === "dividas" ? change < 0 : change > 0;
              return (
                <MiniKpi
                  key={key}
                  label={label}
                  value={currency(current[key])}
                  side={change === null ? "—" : signedBrl0(change)}
                  sideTone={good === null ? "muted" : good ? "positive" : "negative"}
                  sideCaption={sinceCaption}
                  info={
                    <InfoTip
                      explanation={explain(key, key === "dividas" ? [nominalDebtNote(personDebts[personDebts.length - 1]?.outstanding)] : [])}
                    />
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <EvolutionExplorer data={evolution} fixedScope={person.id} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <DebtEvolutionPanel data={evolution} fixedScope={person.id} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <CompositionPanel
              scopes={[
                {
                  id: person.id,
                  label: person.name,
                  ...composition,
                  total: composition.cash + composition.benefits + composition.investments,
                  debtPvTotal: current.dividas,
                },
              ]}
            />
            <VariationPanel data={changes.slice(-12)} average={average?.value ?? null} />
          </div>
        </div>

        <div className="mt-4">
          <AccountsTable data={evolution} scope={person.id} />
        </div>
      </PageBody>
    </>
  );
}
