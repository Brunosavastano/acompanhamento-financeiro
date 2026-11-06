import { Fragment } from "react";
import { clsx } from "clsx";
import {
  CalendarClock,
  CalendarRange,
  CircleMinus,
  CircleSlash,
  CreditCard,
  FileQuestion,
  LifeBuoy,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { explain, explainAlerts } from "@/lib/explanations";
import type { AlertKind, MonthInsights, Part } from "@/lib/insights";
import { InfoTip } from "@/components/info-tip";

// Ícone por assunto: o alerta nunca depende só da cor para ser entendido.
const ALERT_ICONS: Record<AlertKind, LucideIcon> = {
  missing_debt_declaration: FileQuestion,
  account_negative: CircleMinus,
  close_pending: CalendarClock,
  reserve_below_goal: LifeBuoy,
  invoice_above_average: CreditCard,
  debt_rising: TrendingUp,
  upcoming_installments: CalendarRange,
  account_zeroed: CircleSlash,
};

function Parts({ parts }: { parts: Part[] }) {
  return parts.map((part, index) =>
    typeof part === "string" ? (
      <Fragment key={index}>{part}</Fragment>
    ) : (
      <strong
        key={index}
        className={clsx(
          "whitespace-nowrap font-semibold tabular-nums",
          part.tone === "positive" ? "text-positive-text" : part.tone === "negative" ? "text-negative-text" : "text-snow",
        )}
      >
        {part.text}
      </strong>
    ),
  );
}

/**
 * Topo da visão geral e da página de cada pessoa: "O que mudou" em 2 a 4
 * frases e, ao lado, os pontos de atenção. Sem alertas, a coluna não existe.
 */
export function MonthInsightsPanel({ insights, family }: { insights: MonthInsights; family: boolean }) {
  if (insights.sentences.length === 0) return null;
  const hasAlerts = insights.alerts.length > 0;
  return (
    <section
      aria-labelledby="o-que-mudou"
      className={clsx("grid min-w-0 gap-5 rounded-[14px] border border-edge bg-surface p-5 sm:p-6", hasAlerts && "lg:grid-cols-[1.5fr_1fr] lg:gap-0")}
    >
      <div className={clsx("min-w-0", hasAlerts && "lg:pr-7")}>
        <div className="flex items-center gap-1.5">
          <h2 id="o-que-mudou" className="font-display text-lg font-normal text-snow">
            {insights.title}
          </h2>
          <InfoTip explanation={explain("resumo")} />
        </div>
        <div className="mt-3 flex max-w-[80ch] flex-col gap-2">
          {insights.sentences.map((sentence, index) => (
            <p key={sentence.key} className={index === 0 ? "text-[15px] leading-6 text-snow" : "text-sm leading-[22px] text-body"}>
              <Parts parts={sentence.parts} />
            </p>
          ))}
        </div>
      </div>
      {hasAlerts ? (
        <div className="min-w-0 border-t border-edge-soft pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <div className="flex items-center gap-1.5">
            <h3 id="pontos-de-atencao" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Pontos de atenção
            </h3>
            <InfoTip explanation={explainAlerts(family)} />
          </div>
          <ul aria-labelledby="pontos-de-atencao" className="mt-3 flex flex-col gap-2.5">
            {insights.alerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.kind];
              const high = alert.severity === "high";
              return (
                <li key={alert.kind} className="flex gap-3 rounded-[10px] border border-edge-soft bg-surface-2 px-3.5 py-3">
                  <span
                    className={clsx(
                      "mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      high ? "bg-negative/[0.12] text-negative-text" : "bg-gold/[0.14] text-gold-light",
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-snow">
                      {high ? <span className="sr-only">Importante: </span> : null}
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-[18px] text-muted">
                      <Parts parts={alert.parts} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
