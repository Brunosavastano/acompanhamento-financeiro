import Link from "next/link";
import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, CalendarCheck, TrendingUp } from "lucide-react";
import { getRequiredPageHouseholdId } from "@/lib/authz";
import { currency, number, percent } from "@/lib/format";
import { asMonthStart, nextMonth } from "@/lib/date";
import { getDashboardData } from "@/server/metrics";
import {
  CompositionPanel,
  EvolutionPanel,
  HeroSparkline,
  VariationPanel,
} from "@/components/dashboard-panels";
import { EmptyState, PageBody, Panel, PanelTitle } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MonthPager } from "@/components/month-pager";

// Tweaks de exibição do dashboard (ver handoff: props do componente).
const MOSTRAR_MEDIA_VARIACAO = true;
const JANELA_MEDIA_MESES: 6 | 12 = 12;

// Meta padrão de meses de reserva quando não há meta cadastrada (handoff: "A meta da família é 6").
const META_RESERVA_PADRAO = 6;

function monthName(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(asMonthStart(value));
}

function brl0(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function signedBrl0(value: number) {
  return `${value >= 0 ? "+" : "-"}${brl0(Math.abs(value))}`;
}

function signedPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${percent(value, digits)}`;
}

type BadgeTone = "positive" | "gold" | "negative";

const badgeTones: Record<BadgeTone, string> = {
  positive: "bg-positive/[0.12] text-positive-text",
  gold: "bg-gold/[0.14] text-gold-light",
  negative: "bg-negative/[0.12] text-negative-text",
};

const barTones: Record<BadgeTone, string> = {
  positive: "bg-positive",
  gold: "bg-gold",
  negative: "bg-negative",
};

function HealthCard({
  title,
  badge,
  tone,
  barPct,
  children,
}: {
  title: string;
  badge: string;
  tone: BadgeTone;
  barPct: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-edge-soft bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-body">{title}</span>
        <span className={clsx("rounded-full px-2.5 py-[3px] text-[11px] font-semibold", badgeTones[tone])}>{badge}</span>
      </div>
      <p className="mt-2.5 text-xs leading-[18px] text-muted">{children}</p>
      <div className="mt-3 h-1.5 rounded-full bg-elevated">
        <div
          className={clsx("h-1.5 rounded-full", barTones[tone])}
          style={{ width: `${Math.min(Math.max(barPct, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  side,
  sideTone,
  sideCaption,
}: {
  label: string;
  value: string;
  side: string;
  sideTone: "positive" | "muted" | "negative";
  sideCaption: string;
}) {
  const tones = { positive: "text-positive-text", muted: "text-muted", negative: "text-negative-text" };
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-edge bg-surface px-5 py-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
        <div className="mt-1.5 truncate text-[22px] font-semibold tabular-nums text-snow">{value}</div>
      </div>
      <span className={clsx("shrink-0 text-right text-xs font-medium", tones[sideTone])}>
        {side}
        <br />
        <span className="font-normal text-faint">{sideCaption}</span>
      </span>
    </div>
  );
}

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
        <PageHeader title="Visão geral" />
        <PageBody>
          <EmptyState
            title="Nenhum fechamento encontrado"
            description="Use Dados e relatórios para importar a planilha e gerar os primeiros fechamentos."
          />
        </PageBody>
      </>
    );
  }

  const kpis = data.kpis;
  const history = data.charts.netWorthEvolution;
  const currentKey = data.periodMonth.slice(0, 7);
  const currentIndex = history.findIndex((row) => row.month === currentKey);
  const upToCurrent = currentIndex >= 0 ? history.slice(0, currentIndex + 1) : history;

  // Variações mensais até o mês de referência; a primeira linha do histórico
  // não tem mês anterior (variação sintética 0), então fica de fora da média.
  const variationRows = data.charts.monthlyVariation
    .slice(1, currentIndex >= 0 ? currentIndex + 1 : undefined)
    .map((row) => ({ month: String(row.month), value: Number(row.value) }));
  const averageWindow = variationRows.slice(-JANELA_MEDIA_MESES);
  const averageVariation =
    averageWindow.length > 0 ? averageWindow.reduce((sum, row) => sum + row.value, 0) / averageWindow.length : null;

  const previousMonth = currentIndex > 0 ? history[currentIndex - 1].month : null;
  const latestPeriod = data.availablePeriods[data.availablePeriods.length - 1]?.periodMonth ?? data.periodMonth;
  const monthToClose = monthName(nextMonth(asMonthStart(latestPeriod)));
  const closedCount = data.availablePeriods.length;

  const netWorthText = currency(kpis.netWorth);
  const decimalsAt = netWorthText.lastIndexOf(",");
  const reserveTarget = data.reserveTargetMonths ?? META_RESERVA_PADRAO;
  const reserveRatio = reserveTarget > 0 ? kpis.reserveMonths / reserveTarget : 0;

  const health = {
    reserva:
      reserveRatio >= 1
        ? { badge: "Meta atingida", tone: "positive" as const }
        : reserveRatio >= 0.75
          ? { badge: "Quase lá", tone: "gold" as const }
          : reserveRatio >= 0.4
            ? { badge: "Em construção", tone: "gold" as const }
            : { badge: "Atenção", tone: "negative" as const },
    dividas:
      kpis.debtToAssets <= 0.05
        ? { badge: "Sob controle", tone: "positive" as const }
        : kpis.debtToAssets <= 0.15
          ? { badge: "Exige atenção", tone: "gold" as const }
          : { badge: "Alto", tone: "negative" as const },
    poupanca:
      data.budget.budgetSavingsRate >= 0.2
        ? { badge: "Ótimo ritmo", tone: "positive" as const }
        : data.budget.budgetSavingsRate >= 0.1
          ? { badge: "Bom ritmo", tone: "positive" as const }
          : data.budget.budgetSavingsRate >= 0
            ? { badge: "Ritmo baixo", tone: "gold" as const }
            : { badge: "No vermelho", tone: "negative" as const },
    renda:
      data.budget.incomeCommitment <= 0.6
        ? { badge: "Confortável", tone: "positive" as const }
        : data.budget.incomeCommitment <= 0.85
          ? { badge: "Atenção", tone: "negative" as const }
          : { badge: "Crítico", tone: "negative" as const },
  };

  const variationPositive = kpis.monthlyVariation >= 0;

  return (
    <>
      <PageHeader
        title="Visão geral"
        actions={
          <>
            <MonthPager
              current={data.periodMonth}
              periods={data.availablePeriods.map((period) => period.periodMonth)}
              basePath="/dashboard"
            />
            <Link
              href="/fechamento"
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-[9px] text-[13px] font-semibold text-sidebar hover:bg-gold-light"
            >
              <CalendarCheck className="h-[15px] w-[15px]" aria-hidden />
              Fechar {monthToClose}
            </Link>
          </>
        }
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="relative min-w-0 overflow-hidden rounded-[14px] border border-edge bg-[linear-gradient(160deg,#101A30_0%,#0E1526_55%)] p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Patrimônio líquido da família
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
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      variationPositive ? badgeTones.positive : badgeTones.negative,
                    )}
                  >
                    {variationPositive ? (
                      <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    )}
                    {signedBrl0(kpis.monthlyVariation)} em {monthName(data.periodMonth)}
                  </span>
                  {previousMonth ? (
                    <span className="text-xs text-faint">
                      {signedPercent(kpis.monthlyVariationPct)} sobre {monthName(previousMonth)}
                    </span>
                  ) : null}
                  {MOSTRAR_MEDIA_VARIACAO && averageVariation !== null ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-info/[0.12] px-2.5 py-1 text-xs font-semibold text-info-text">
                      <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      {signedBrl0(averageVariation)}/mês em média · últimos {averageWindow.length} meses
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full border border-edge bg-night/50 px-3 py-[5px] text-[11px] font-semibold text-muted">
                {closedCount} {closedCount === 1 ? "mês fechado" : "meses fechados"}
              </span>
            </div>
            <HeroSparkline data={upToCurrent.slice(-12).map((row) => ({ month: String(row.month), value: Number(row.value) }))} />
          </section>

          <div className="grid min-w-0 gap-4 lg:grid-rows-3">
            <MiniKpi
              label="Caixa disponível"
              value={currency(kpis.cashTotal)}
              side={`${number(kpis.reserveMonths, 1)} meses`}
              sideTone="positive"
              sideCaption="de reserva"
            />
            <MiniKpi
              label="Investimentos"
              value={currency(kpis.investmentsTotal)}
              side={percent(kpis.investmentsToAssets, 1)}
              sideTone="muted"
              sideCaption="dos ativos"
            />
            <MiniKpi
              label="Dívidas do cartão"
              value={currency(kpis.debtPvTotal)}
              side={percent(kpis.debtToAssets, 1)}
              sideTone="negative"
              sideCaption="do patrimônio"
            />
          </div>
        </div>

        <Panel className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <PanelTitle>Saúde financeira</PanelTitle>
            <span className="text-xs text-faint">Como estamos neste mês, em linguagem simples</span>
          </div>
          <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <HealthCard
              title="Reserva de emergência"
              badge={health.reserva.badge}
              tone={health.reserva.tone}
              barPct={reserveRatio * 100}
            >
              Hoje o caixa cobre <strong className="font-semibold text-snow">{number(kpis.reserveMonths, 1)} meses</strong> de
              gastos. A meta da família é {number(reserveTarget, 0)}.
            </HealthCard>
            <HealthCard
              title="Dívidas"
              badge={health.dividas.badge}
              tone={health.dividas.tone}
              barPct={kpis.debtToAssets * 100 * 5}
            >
              As faturas futuras equivalem a{kpis.debtToAssets <= 0.05 ? " só" : ""}{" "}
              <strong className="font-semibold text-snow">{percent(kpis.debtToAssets, 1)}</strong> do que a família possui.
            </HealthCard>
            <HealthCard
              title="Poupança do mês"
              badge={health.poupanca.badge}
              tone={health.poupanca.tone}
              barPct={data.budget.budgetSavingsRate * 100 * 2.5}
            >
              {data.budget.budgetSavingsRate >= 0 ? (
                <>
                  Sobraram <strong className="font-semibold text-snow">{percent(data.budget.budgetSavingsRate, 1)}</strong> da
                  renda — cerca de {brl0(data.budget.monthlySurplus)} guardados.
                </>
              ) : (
                <>
                  As despesas superaram a renda em{" "}
                  <strong className="font-semibold text-snow">{brl0(Math.abs(data.budget.monthlySurplus))}</strong> neste mês.
                </>
              )}
            </HealthCard>
            <HealthCard
              title="Renda comprometida"
              badge={health.renda.badge}
              tone={health.renda.tone}
              barPct={data.budget.incomeCommitment * 100}
            >
              <strong className="font-semibold text-snow">{percent(data.budget.incomeCommitment, 1)}</strong> da renda já tem
              destino entre contas fixas e cartão.
            </HealthCard>
          </div>
        </Panel>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <EvolutionPanel data={upToCurrent.map((row) => ({ month: String(row.month), value: Number(row.value) }))} />
            <VariationPanel data={variationRows.slice(-12)} average={averageVariation} />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <CompositionPanel scopes={data.composition} />
            <Panel className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <PanelTitle>Metas em andamento</PanelTitle>
                <Link href="/metas" className="focus-ring text-xs font-semibold text-gold hover:text-gold-light">
                  Ver todas
                </Link>
              </div>
              {data.closestGoals.length > 0 ? (
                <div className="mt-4 flex flex-col gap-3.5">
                  {data.closestGoals.map((goal) => (
                    <div key={goal.id}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-body">{goal.title}</span>
                        <span className="font-semibold tabular-nums text-snow">{percent(goal.progressPct, 0)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-elevated">
                        <div
                          className="h-1.5 rounded-full bg-gold"
                          style={{ width: `${Math.min(goal.progressPct * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Nenhuma meta cadastrada ainda.</p>
              )}
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
