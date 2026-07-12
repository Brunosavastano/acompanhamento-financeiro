import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { asMonthStart } from "@/lib/date";

function monthLabel(periodMonth: string) {
  const date = asMonthStart(periodMonth);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getUTCFullYear()}`;
}

function PagerLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const className =
    "focus-ring inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-snow";
  if (!href) {
    return <span className={clsx(className, "pointer-events-none opacity-30")}>{children}</span>;
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/**
 * Seletor global de mês de referência: pill `‹ Setembro 2025 ›` que navega
 * entre os períodos fechados existentes via searchParam `period_month`.
 */
export function MonthPager({
  current,
  periods,
  basePath,
  prefix,
}: {
  current: string;
  periods: string[];
  basePath: string;
  prefix?: string;
}) {
  const index = periods.indexOf(current);
  const href = (period?: string) => (period ? `${basePath}?period_month=${period.slice(0, 7)}` : null);
  const previous = index > 0 ? periods[index - 1] : undefined;
  const next = index >= 0 && index < periods.length - 1 ? periods[index + 1] : undefined;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface p-1">
      <PagerLink href={href(previous)} label="Mês anterior">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </PagerLink>
      <span className="whitespace-nowrap px-1.5 text-[13px] font-semibold tabular-nums text-snow">
        {prefix ? `${prefix} ` : ""}
        {monthLabel(current)}
      </span>
      <PagerLink href={href(next)} label="Próximo mês">
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </PagerLink>
    </div>
  );
}
