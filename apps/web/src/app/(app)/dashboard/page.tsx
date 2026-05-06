import Link from "next/link";
import { BarChart3, CalendarDays } from "lucide-react";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { currency, number, percent } from "@/lib/format";
import { displayMonth } from "@/lib/date";
import { getDashboardData } from "@/server/metrics";
import { CompositionChart, NetWorthChart, ReserveChart, VariationChart, RatioChart } from "@/components/dashboard-charts";
import { EmptyState, KpiCard, Panel } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period_month?: string }>;
}) {
  const householdId = await getRequiredPageHouseholdId();
  const params = await searchParams;
  const data = await getDashboardData(householdId, params.period_month);

  if (!data.hasData || !data.kpis) {
    return (
      <>
        <PageHeader title="Dashboard" description="Importe a planilha inicial para comecar o historico financeiro." />
        <EmptyState title="Nenhum fechamento encontrado" description="Use Relatorios para importar a planilha e gerar os primeiros snapshots." />
      </>
    );
  }

  const kpis = data.kpis;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Referencia: ${displayMonth(data.periodMonth)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action="/dashboard" className="flex items-center gap-2">
              <label className="sr-only" htmlFor="period_month">
                Mes de referencia
              </label>
              <select
                id="period_month"
                name="period_month"
                defaultValue={data.periodMonth.slice(0, 7)}
                className="focus-ring rounded-md border border-line bg-ink px-3 py-2 text-sm text-white"
              >
                {data.availablePeriods.map((period) => (
                  <option key={period.periodMonth} value={period.periodMonth.slice(0, 7)}>
                    {period.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan hover:text-white">
                <BarChart3 className="h-4 w-4" />
                Ver
              </button>
            </form>
            <Link href="/fechamento" className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-ink">
              <CalendarDays className="h-4 w-4" />
              Novo fechamento
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Patrimonio liquido" value={currency(kpis.netWorth)} detail={`${currency(kpis.monthlyVariation)} vs mes anterior`} tone={kpis.monthlyVariation >= 0 ? "green" : "magenta"} />
        <KpiCard label="Caixa" value={currency(kpis.cashTotal)} detail={`${number(kpis.reserveMonths, 2)} meses de reserva`} tone="cyan" />
        <KpiCard label="Investimentos" value={currency(kpis.investmentsTotal)} detail={`${percent(kpis.investmentsToAssets, 1)} dos ativos`} tone="green" />
        <KpiCard label="Dividas PV" value={currency(kpis.debtPvTotal)} detail={`${percent(kpis.debtToAssets, 1)} dos ativos`} tone="magenta" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Poupanca patrimonial" value={percent(kpis.patrimonialSavingsRate, 1)} detail="Variacao do PL sobre receita orcada" tone={kpis.patrimonialSavingsRate >= 0 ? "green" : "magenta"} />
        <KpiCard label="Poupanca orcamentaria" value={percent(kpis.budgetSavingsRate, 1)} detail="Sobra recorrente sobre receita" tone={kpis.budgetSavingsRate >= 0 ? "green" : "magenta"} />
        <KpiCard label="Fatura do mes" value={currency(data.debt.monthlyInvoiceTotal)} detail={`Float: ${currency(data.debt.floatGain)}`} tone="amber" />
        <KpiCard label="Sobra mensal estimada" value={currency(data.budget.monthlySurplus)} detail={`${percent(data.budget.incomeCommitment, 1)} da renda comprometida`} tone={data.budget.monthlySurplus >= 0 ? "green" : "magenta"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">Evolucao do patrimonio liquido</h2>
            <p className="text-sm text-slate-400">Historico mensal recalculado pelo app.</p>
          </div>
          <NetWorthChart data={data.charts.netWorthEvolution} />
        </Panel>
        <Panel>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">Composicao patrimonial</h2>
            <p className="text-sm text-slate-400">Caixa, investimentos e dividas PV.</p>
          </div>
          <CompositionChart data={data.charts.assetComposition} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-white">Variacao mensal</h2>
          <VariationChart data={data.charts.monthlyVariation} />
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-white">Divida / ativos</h2>
          <RatioChart data={data.charts.debtToAssets} />
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-white">Meses de reserva</h2>
          <ReserveChart data={data.charts.reserveMonths} />
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Metas mais proximas</h2>
            <p className="text-sm text-slate-400">Ordenadas por progresso no mes de referencia.</p>
          </div>
          <Link href="/metas" className="text-sm font-medium text-cyan hover:text-white">
            Ver metas
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {data.closestGoals.map((goal) => (
            <div key={goal.id} className="rounded-md border border-line bg-ink p-4">
              <div className="text-sm font-semibold text-white">{goal.title}</div>
              <div className="mt-3 h-2 rounded-full bg-panel2">
                <div className="h-2 rounded-full bg-green" style={{ width: `${Math.min(goal.progressPct * 100, 100)}%` }} />
              </div>
              <div className="mt-2 text-xs text-slate-400">{percent(goal.progressPct, 1)} atingido</div>
              {goal.requiredCagr !== null ? (
                <div className="mt-2 text-xs font-medium text-amber">{percent(goal.requiredCagr, 1)} a.a. necessario</div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
