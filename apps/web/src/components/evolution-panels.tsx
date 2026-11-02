"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency } from "@/lib/format";
import {
  COMBINABLE_KEYS,
  FAMILY_SCOPE,
  SUMMARY_KEYS,
  SUMMARY_LABELS,
  accountSeries,
  accountTable,
  combinedLabel,
  combinedValue,
  debtRows,
  outlookRows,
  summaryRows,
  type AccountSeries,
  type EvolutionData,
  type Scope,
  type SummaryKey,
} from "@/lib/evolution";
import { ChartWindowToggle, GRID, TICK, brl0, monthShort, tooltipContentStyle, type WindowKey } from "@/components/dashboard-panels";

// Paleta validada (dataviz) contra o fundo escuro do app: cor fixa por série,
// nunca pela posição — esconder uma série não repinta as outras.
const SERIES_COLORS: Record<SummaryKey, string> = {
  patrimonio: "#c98500",
  caixa: "#3987e5",
  investimentos: "#199e70",
  dividas: "#d95926",
};
const COMBINED_COLOR = "#C7CFDD";
const INVOICE_COLOR = "#9085e9";
const OUTSTANDING_COLOR = "#d95926";
const AVERAGE_COLOR = "#8B96AD";
const SPARK_COLOR = "#c98500";

const ACCOUNT_CATEGORY_LABELS = { cash: "Caixa", benefit: "VR/VA", investment: "Investimentos", cashback: "Cashback" } as const;

function firstName(name: string) {
  return name.split(" ")[0];
}

function monthLong(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
}

function windowed<T>(rows: T[], window: WindowKey) {
  return window === "all" ? rows : rows.slice(-Number(window));
}

function kTick(value: number) {
  if (value === 0) return "0";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1000)} mil`;
}

function signedBrl0(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${brl0(Math.abs(value))}`;
}

function deltaTone(value: number | null) {
  return value === null || value === 0 ? "text-faint" : value > 0 ? "text-positive-text" : "text-negative-text";
}

function ScopeToggle({ people, value, onChange, label }: { people: EvolutionData["people"]; value: Scope; onChange: (scope: Scope) => void; label: string }) {
  const options = [{ id: FAMILY_SCOPE, name: "Família" }, ...people.map((person) => ({ id: person.id, name: firstName(person.name) }))];
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-edge bg-surface-2 p-[3px]">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={clsx(
            "focus-ring rounded-md px-3 py-[5px] text-xs font-semibold",
            option.id === value ? "bg-elevated text-snow" : "text-muted hover:text-snow",
          )}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <span className="inline-block h-0 w-3.5 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} aria-hidden />
  ) : (
    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
  );
}

type TooltipEntry = { dataKey?: string | number; value?: number | string; color?: string; name?: string };

function TooltipBox({ title, rows, note }: { title: string; rows: Array<{ label: string; value: string; color: string; dashed?: boolean }>; note?: string }) {
  return (
    <div style={tooltipContentStyle} className="px-3 py-2">
      <div className="mb-1.5 text-[12px] font-semibold text-muted">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 py-0.5 text-[12px]">
          <LegendSwatch color={row.color} dashed={row.dashed} />
          <span className="text-body">{row.label}</span>
          <span className="ml-auto pl-4 font-semibold tabular-nums text-snow">{row.value}</span>
        </div>
      ))}
      {note ? <div className="mt-1.5 max-w-[220px] text-[11px] leading-[15px] text-faint">{note}</div> : null}
    </div>
  );
}

/**
 * Evolução do patrimônio por pessoa, com séries escolhidas e a evolução de cada conta.
 * Com `fixedScope` (página de uma pessoa) a chave Família/pessoa some.
 */
export function EvolutionExplorer({ data, fixedScope }: { data: EvolutionData; fixedScope?: Scope }) {
  const [scope, setScope] = useState<Scope>(fixedScope ?? FAMILY_SCOPE);
  const [selected, setSelected] = useState<SummaryKey[]>([...SUMMARY_KEYS]);
  const [combine, setCombine] = useState(false);
  const [window, setWindow] = useState<WindowKey>("12");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows = useMemo(() => windowed(summaryRows(data, scope), window), [data, scope, window]);
  const accounts = useMemo(() => {
    const windowedData = { accounts: data.accounts, months: windowed(data.months, window) };
    return accountSeries(windowedData, scope);
  }, [data, scope, window]);
  // O gráfico ampliado tem a própria janela de meses, então recebe a história inteira de cada conta.
  const expandable = useMemo(() => {
    const full = new Map(accountSeries(data, scope).map((series) => [series.account.key, series]));
    return accounts.map((series) => full.get(series.account.key) ?? series);
  }, [data, scope, accounts]);

  const combinable = selected.filter((key) => COMBINABLE_KEYS.includes(key));
  const combining = combine && combinable.length >= 2;
  const lines: Array<{ key: string; label: string; color: string; dashed?: boolean }> = combining
    ? [
        ...(selected.includes("patrimonio") ? [{ key: "patrimonio", label: SUMMARY_LABELS.patrimonio, color: SERIES_COLORS.patrimonio }] : []),
        { key: "soma", label: combinedLabel(combinable), color: COMBINED_COLOR },
      ]
    : SUMMARY_KEYS.filter((key) => selected.includes(key)).map((key) => ({
        key,
        label: SUMMARY_LABELS[key],
        color: SERIES_COLORS[key],
        dashed: key === "dividas",
      }));
  const chartRows = rows.map((row) => ({ ...row, soma: combinedValue(row, combinable) }));
  const peopleById = new Map(data.people.map((person) => [person.id, firstName(person.name)]));

  function toggle(key: SummaryKey) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-normal text-snow">Evolução</h2>
          <p className="mt-0.5 text-xs text-faint">saldos de cada mês fechado; dívidas a valor presente, como entram no patrimônio</p>
        </div>
        <ChartWindowToggle value={window} onChange={setWindow} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {fixedScope ? null : <ScopeToggle people={data.people} value={scope} onChange={setScope} label="Pessoa da evolução" />}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Séries do gráfico">
          {SUMMARY_KEYS.map((key) => {
            const active = selected.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(key)}
                className={clsx(
                  "focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  active ? "border-edge bg-elevated text-snow" : "border-edge-soft text-faint hover:text-body",
                )}
              >
                <LegendSwatch color={active ? SERIES_COLORS[key] : "#3A4459"} dashed={key === "dividas"} />
                {SUMMARY_LABELS[key]}
              </button>
            );
          })}
        </div>
        <label
          className={clsx("inline-flex items-center gap-2 text-xs font-semibold", combinable.length >= 2 ? "text-body" : "text-faint")}
          title="Junta caixa, investimentos e dívidas selecionados numa linha só"
        >
          <input
            type="checkbox"
            checked={combine}
            disabled={combinable.length < 2}
            onChange={(event) => setCombine(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#c98500]"
          />
          Somar numa linha só
        </label>
        {!fixedScope && scope !== FAMILY_SCOPE ? (
          <Link
            href={`/pessoas/${scope}?period_month=${data.periodMonth}`}
            className="focus-ring ml-auto rounded text-xs font-semibold text-gold hover:text-gold-light"
          >
            Abrir a página de {peopleById.get(scope) ?? "?"} →
          </Link>
        ) : null}
      </div>

      {chartRows.length >= 2 && lines.length > 0 ? (
        <div className="mt-4 h-[300px]" role="img" aria-label={`Evolução de ${lines.map((line) => line.label).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
              <XAxis
                dataKey="month"
                tick={TICK}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                tickFormatter={monthShort}
                interval={chartRows.length > 8 ? 1 : 0}
              />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={kTick} />
              <Tooltip
                cursor={{ stroke: "#3A4459", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const entries = payload as TooltipEntry[];
                  return (
                    <TooltipBox
                      title={monthShort(String(label))}
                      rows={lines.map((line) => ({
                        label: line.label,
                        color: line.color,
                        dashed: line.dashed,
                        value: currency(Number(entries.find((entry) => entry.dataKey === line.key)?.value ?? 0)),
                      }))}
                    />
                  );
                }}
              />
              {lines.map((line) => (
                <Line
                  key={line.key}
                  type="linear"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={line.key === "soma" ? 2.5 : 2}
                  strokeDasharray={line.dashed ? "6 4" : undefined}
                  dot={false}
                  activeDot={{ r: 4, fill: line.color, stroke: "#0E1526", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">
          {lines.length === 0 ? "Escolha ao menos uma série para ver o gráfico." : "Feche pelo menos dois meses para ver a evolução."}
        </p>
      )}

      {accounts.length > 0 ? (
        <div className="mt-6 border-t border-edge-soft pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-snow">Cada conta</h3>
            <span className="text-xs text-faint">variação em relação ao mês anterior · clique para ampliar</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            {accounts.map((series) => {
              const delta = series.previous === null ? null : series.current - series.previous;
              return (
                <button
                  key={series.account.key}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setExpandedKey(series.account.key)}
                  className="focus-ring group min-w-0 rounded-[10px] border border-edge-soft bg-surface-2 px-3 py-2.5 text-left hover:border-edge hover:bg-[#101A2E] sm:px-3.5 sm:py-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-body">
                      {scope === FAMILY_SCOPE ? `${peopleById.get(series.account.personId) ?? ""} · ` : ""}
                      {series.account.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-faint">
                      <span className="hidden sm:inline">{ACCOUNT_CATEGORY_LABELS[series.account.category]}</span>
                      <Maximize2 className="h-3 w-3 opacity-60 group-hover:text-snow group-hover:opacity-100" aria-hidden />
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[14px] font-semibold tabular-nums text-snow sm:text-[15px]">{brl0(series.current)}</span>
                    {delta !== null ? <span className={clsx("text-[11px] font-semibold tabular-nums", deltaTone(delta))}>{signedBrl0(delta)}</span> : null}
                  </span>
                  {series.points.length >= 2 ? (
                    <span className="mt-2 block h-[40px]" aria-hidden>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series.points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Line type="linear" dataKey="value" stroke={SPARK_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <AccountDialog
            items={expandable}
            activeKey={expandedKey}
            onSelect={setExpandedKey}
            onClose={() => setExpandedKey(null)}
            initialWindow={window}
            ownerName={(personId) => (scope === FAMILY_SCOPE ? (peopleById.get(personId) ?? null) : null)}
          />
        </div>
      ) : null}
    </section>
  );
}

function IconButton({ label, onClick, children, ref }: { label: string; onClick: () => void; children: ReactNode; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-snow"
    >
      {children}
    </button>
  );
}

function DialogStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx("mt-1 text-[15px] font-semibold tabular-nums", tone ?? "text-snow")}>{value}</div>
    </div>
  );
}

/**
 * Gráfico de uma conta ampliado no centro da tela (dialog nativo: Esc fecha,
 * o foco fica preso na janela). Setas ← → passam para a conta vizinha.
 */
function AccountDialog({
  items,
  activeKey,
  onSelect,
  onClose,
  initialWindow,
  ownerName,
}: {
  items: AccountSeries[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  initialWindow: WindowKey;
  ownerName: (personId: string) => string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  // O gráfico só monta com a janela já aberta (o ResponsiveContainer precisa medir o espaço).
  const [open, setOpen] = useState(false);
  const [window, setWindow] = useState<WindowKey>(initialWindow);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeKey !== null && !dialog.open) {
      setWindow(initialWindow);
      dialog.showModal();
      closeRef.current?.focus();
      setOpen(true);
    } else if (activeKey === null && dialog.open) {
      dialog.close();
    }
  }, [activeKey, initialWindow]);

  const index = items.findIndex((item) => item.account.key === activeKey);
  const series = index >= 0 ? items[index] : null;
  const go = (step: number) => {
    if (index < 0 || items.length < 2) return;
    onSelect(items[(index + step + items.length) % items.length].account.key);
  };

  // Variação de cada mês calculada na história inteira: o primeiro mês da janela também tem a sua.
  const allRows = (series?.points ?? []).map((point, i, points) => ({
    ...point,
    change: i === 0 ? null : Math.round((point.value - points[i - 1].value) * 100) / 100,
  }));
  const rows = windowed(allRows, window);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const previous = allRows.length > 1 ? allRows[allRows.length - 2] : null;
  const highest = rows.reduce<(typeof rows)[number] | null>((best, row) => (best === null || row.value > best.value ? row : best), null);
  const values = rows.map((row) => row.value);
  const small = values.length > 0 && Math.max(...values.map(Math.abs)) < 1000;
  const crossesZero = values.some((value) => value < 0) && values.some((value) => value > 0);
  const owner = series ? ownerName(series.account.personId) : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        setOpen(false);
        onClose();
      }}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Clique fora da janela (no fundo escurecido) fecha; arrastar de dentro para fora não.
        if (pressedBackdrop.current && event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          go(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      className="max-h-[calc(100dvh-24px)] w-[min(980px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[14px] border border-edge bg-surface p-0 text-body shadow-glow backdrop:bg-[#030610]/80"
    >
      {series && last ? (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
                {owner ? `${owner} · ` : ""}
                {ACCOUNT_CATEGORY_LABELS[series.account.category]}
              </div>
              <h2 id={titleId} className="mt-1 truncate font-display text-xl font-normal text-snow">
                {series.account.name}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {items.length > 1 ? (
                <>
                  <IconButton label="Conta anterior" onClick={() => go(-1)}>
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <span className="px-1 text-xs tabular-nums text-faint">
                    {index + 1}/{items.length}
                  </span>
                  <IconButton label="Próxima conta" onClick={() => go(1)}>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </IconButton>
                </>
              ) : null}
              <IconButton ref={closeRef} label="Fechar" onClick={() => dialogRef.current?.close()}>
                <X className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-end sm:gap-x-9">
            <div className="col-span-2 min-w-0">
              <div className="text-xs text-muted">
                Saldo em {monthLong(last.month)} de {last.month.slice(0, 4)}
              </div>
              <div className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-snow">{currency(last.value)}</div>
            </div>
            {previous ? (
              <DialogStat
                label={`Desde ${monthShort(previous.month)}`}
                value={signedBrl0(last.value - previous.value)}
                tone={deltaTone(last.value - previous.value)}
              />
            ) : null}
            {first && first !== last ? (
              <DialogStat label={`Desde ${monthShort(first.month)}`} value={signedBrl0(last.value - first.value)} tone={deltaTone(last.value - first.value)} />
            ) : null}
            {highest ? <DialogStat label={`Maior saldo (${monthShort(highest.month)})`} value={brl0(highest.value)} /> : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-faint">saldo no fechamento de cada mês</span>
            <ChartWindowToggle value={window} onChange={setWindow} />
          </div>

          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="h-[260px] min-w-0 sm:h-[320px]" role="img" aria-label={`Saldo de ${series.account.name} por mês`}>
              {open && rows.length >= 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={TICK}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      tickFormatter={monthShort}
                      interval="equidistantPreserveStart"
                      minTickGap={14}
                    />
                    <YAxis
                      tick={TICK}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      domain={["auto", "auto"]}
                      tickFormatter={(value: number) => (small ? brl0(value) : kTick(value))}
                    />
                    {crossesZero ? <ReferenceLine y={0} stroke="#3A4459" /> : null}
                    <Tooltip
                      cursor={{ stroke: "#3A4459", strokeWidth: 1 }}
                      content={({ active, label }) => {
                        if (!active) return null;
                        const row = rows.find((item) => item.month === String(label));
                        if (!row) return null;
                        return (
                          <TooltipBox
                            title={monthShort(row.month)}
                            rows={[
                              { label: "Saldo", value: currency(row.value), color: SPARK_COLOR },
                              ...(row.change !== null ? [{ label: "No mês", value: signedBrl0(row.change), color: "transparent" }] : []),
                            ]}
                          />
                        );
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="value"
                      stroke={SPARK_COLOR}
                      strokeWidth={2}
                      dot={rows.length <= 12 ? { r: 3, fill: SPARK_COLOR, stroke: "#0E1526", strokeWidth: 1.5 } : false}
                      activeDot={{ r: 5, fill: SPARK_COLOR, stroke: "#0E1526", strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : rows.length < 2 ? (
                <p className="pt-6 text-sm text-muted">Só há um mês fechado nesta janela.</p>
              ) : null}
            </div>
            <div className="rounded-[10px] border border-edge-soft lg:max-h-[320px] lg:overflow-y-auto">
              <table className="w-full text-[13px]">
                <caption className="sr-only">Saldo de {series.account.name} mês a mês</caption>
                <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">
                      Mês
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Saldo
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      No mês
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((row) => (
                    <tr key={row.month} className="border-t border-edge-hair">
                      <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-muted">
                        {monthShort(row.month)}
                      </th>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-snow">{currency(row.value)}</td>
                      <td className={clsx("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", deltaTone(row.change))}>
                        {row.change === null ? "—" : signedBrl0(row.change)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

const GROUP_LABELS = { cash: "Caixa", investments: "Investimentos" } as const;
const GROUP_TOTAL_LABELS = { cash: "Total em caixa", investments: "Total investido" } as const;

/** Saldo de cada conta em cada fechamento, como uma planilha: contas nas linhas, meses nas colunas. */
export function AccountsTable({ data, scope }: { data: EvolutionData; scope: Scope }) {
  const [window, setWindow] = useState<WindowKey>("6");
  const table = useMemo(() => accountTable(data, scope, window === "all" ? undefined : Number(window)), [data, scope, window]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Com mais meses do que cabem, começa mostrando os mais recentes (à direita).
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [table]);

  if (table.months.length === 0) return null;
  const cell = "whitespace-nowrap px-3 py-2 text-right tabular-nums";
  // Primeira coluna fixa ao rolar para os lados, com uma linha separando o que passa por baixo.
  const rowHeader = "sticky left-0 z-[1] whitespace-nowrap bg-surface py-2 pr-4 text-left shadow-[inset_-1px_0_0_#182238]";
  const money = (value: number) => (value === 0 ? "—" : brl0(value));

  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-normal text-snow">Mês a mês</h2>
          <p className="mt-0.5 text-xs text-faint">saldo de cada conta no fechamento de cada mês</p>
        </div>
        <ChartWindowToggle value={window} onChange={setWindow} />
      </div>
      <div ref={scrollRef} className="mt-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className={clsx(rowHeader, "font-semibold")}>
                Conta
              </th>
              {table.months.map((month) => (
                <th key={month} scope="col" className={clsx(cell, "font-semibold")}>
                  {monthShort(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.groups.map((group) => (
              <Fragment key={group.group}>
                <tr>
                  <th
                    scope="colgroup"
                    className={clsx(rowHeader, "border-t border-edge-soft pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint")}
                  >
                    {GROUP_LABELS[group.group]}
                  </th>
                  <td colSpan={table.months.length} className="border-t border-edge-soft" />
                </tr>
                {group.accounts.map(({ account, values }) => (
                  <tr key={account.key} className="text-body">
                    <th scope="row" className={clsx(rowHeader, "font-normal")}>
                      {account.name}
                      {(account.category === "benefit" || account.category === "cashback") && account.name !== ACCOUNT_CATEGORY_LABELS[account.category] ? (
                        <span className="ml-1.5 text-[11px] text-faint">{ACCOUNT_CATEGORY_LABELS[account.category]}</span>
                      ) : null}
                    </th>
                    {values.map((value, index) => (
                      <td key={table.months[index]} className={clsx(cell, value < 0 && "text-negative-text")}>
                        {money(value)}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Com uma conta só, o total repetiria a mesma linha. */}
                {group.accounts.length > 1 ? (
                  <tr className="font-semibold text-snow">
                    <th scope="row" className={clsx(rowHeader, "border-t border-edge-hair font-semibold")}>
                      {GROUP_TOTAL_LABELS[group.group]}
                    </th>
                    {group.totals.map((value, index) => (
                      <td key={table.months[index]} className={clsx(cell, "border-t border-edge-hair")}>
                        {money(value)}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </Fragment>
            ))}
            <tr className="text-body">
              <th scope="row" className={clsx(rowHeader, "border-t border-edge-soft pt-4 font-normal")}>
                Dívidas do cartão
                <span className="block text-[11px] text-faint">a valor presente</span>
              </th>
              {table.debts.map((value, index) => (
                <td key={table.months[index]} className={clsx(cell, "border-t border-edge-soft pt-4", value > 0 && "text-negative-text")}>
                  {value === 0 ? "—" : `−${brl0(value)}`}
                </td>
              ))}
            </tr>
            <tr className="font-semibold text-snow">
              <th scope="row" className={clsx(rowHeader, "font-semibold")}>
                Patrimônio líquido
              </th>
              {table.netWorth.map((value, index) => (
                <td key={table.months[index]} className={cell}>
                  {brl0(value)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={clsx(rowHeader, "font-normal text-muted")}>
                Variação no mês
              </th>
              {table.changes.map((value, index) => (
                <td key={table.months[index]} className={clsx(cell, "font-semibold", deltaTone(value))}>
                  {value === null ? "—" : signedBrl0(value)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Dívidas ao longo do tempo: total a pagar, fatura de cada mês e o que ainda vai vencer. */
export function DebtEvolutionPanel({ data, fixedScope }: { data: EvolutionData; fixedScope?: Scope }) {
  const [scope, setScope] = useState<Scope>(fixedScope ?? FAMILY_SCOPE);
  const [tab, setTab] = useState<"historico" | "proximos">("historico");
  const [window, setWindow] = useState<WindowKey>("12");

  const allRows = useMemo(() => debtRows(data, scope), [data, scope]);
  const rows = windowed(allRows, window).filter((row) => row.outstanding !== null || row.invoice !== null);
  const upcoming = useMemo(() => outlookRows(data, scope), [data, scope]);
  const peopleById = new Map(data.people.map((person) => [person.id, firstName(person.name)]));
  const names = (ids: string[]) => ids.map((id) => peopleById.get(id) ?? "?").join(" e ");

  const current = allRows[allRows.length - 1];
  const previous = allRows.length > 1 ? allRows[allRows.length - 2] : null;
  const asOf = data.debt.outlook.asOfMonth;
  const olderBases = Object.entries(data.debt.outlook.byPerson)
    .filter(([personId, value]) => (scope === FAMILY_SCOPE || scope === personId) && value.baseMonth !== asOf && value.schedule.length > 0)
    .map(([personId, value]) => `${peopleById.get(personId) ?? "?"}: declaração de ${monthShort(value.baseMonth)}`);

  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-normal text-snow">Dívidas do cartão</h2>
          <p className="mt-0.5 text-xs text-faint">soma das parcelas declaradas em cada fechamento</p>
        </div>
        <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-[3px]" role="tablist" aria-label="Visão das dívidas">
          {(
            [
              ["historico", "Histórico"],
              ["proximos", "Próximos meses"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                "focus-ring rounded-md px-3 py-[5px] text-xs font-semibold",
                tab === key ? "bg-elevated text-snow" : "text-muted hover:text-snow",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!fixedScope || tab === "historico" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {fixedScope ? null : <ScopeToggle people={data.people} value={scope} onChange={setScope} label="Pessoa das dívidas" />}
          {tab === "historico" ? (
            <div className="ml-auto">
              <ChartWindowToggle value={window} onChange={setWindow} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "historico" ? (
        rows.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-body">
              <span className="inline-flex items-center gap-2">
                <LegendSwatch color={OUTSTANDING_COLOR} />
                Total a pagar
              </span>
              <span className="inline-flex items-center gap-2">
                <LegendSwatch color={INVOICE_COLOR} />
                Fatura do mês
              </span>
              <span className="inline-flex items-center gap-2">
                <LegendSwatch color={AVERAGE_COLOR} dashed />
                Média da fatura (12 meses)
              </span>
            </div>
            <div className="mt-3 h-[260px]" role="img" aria-label="Total a pagar, fatura do mês e média da fatura por mês">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={TICK}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    tickFormatter={monthShort}
                    interval={rows.length > 8 ? 1 : 0}
                  />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={kTick} />
                  <Tooltip
                    cursor={{ fill: "#141D33", opacity: 0.4 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = rows.find((item) => item.month === String(label));
                      if (!row) return null;
                      const notes = [
                        row.invoiceProjected ? "Fatura projetada: o mês não teve declaração própria." : "",
                        row.missing.length > 0 ? `Sem declaração de ${names(row.missing)} neste mês.` : "",
                      ].filter(Boolean);
                      return (
                        <TooltipBox
                          title={monthShort(row.month)}
                          rows={[
                            { label: "Total a pagar", value: row.outstanding === null ? "—" : currency(row.outstanding), color: OUTSTANDING_COLOR },
                            { label: "Fatura do mês", value: row.invoice === null ? "—" : currency(row.invoice), color: INVOICE_COLOR },
                            {
                              label: "Média da fatura",
                              value: row.averageInvoice === null ? "—" : currency(row.averageInvoice),
                              color: AVERAGE_COLOR,
                              dashed: true,
                            },
                          ]}
                          note={notes.join(" ") || undefined}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="invoice" name="Fatura do mês" fill={INVOICE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                    {rows.map((row) => (
                      <Cell key={row.month} fill={INVOICE_COLOR} fillOpacity={row.invoiceProjected ? 0.45 : 1} />
                    ))}
                  </Bar>
                  <Line
                    type="linear"
                    dataKey="outstanding"
                    name="Total a pagar"
                    stroke={OUTSTANDING_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: OUTSTANDING_COLOR, stroke: "#0E1526", strokeWidth: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="averageInvoice"
                    name="Média da fatura"
                    stroke={AVERAGE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <DebtSummary current={current} previous={previous} names={names} />
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">Nenhuma dívida de cartão declarada nos meses fechados.</p>
        )
      ) : upcoming.length > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-body">
            <span className="inline-flex items-center gap-2">
              <LegendSwatch color={INVOICE_COLOR} />
              Parcelas que vencem no mês
            </span>
            <span className="inline-flex items-center gap-2">
              <LegendSwatch color={OUTSTANDING_COLOR} />
              Ainda a pagar depois do mês
            </span>
          </div>
          <div className="mt-3 h-[260px]" role="img" aria-label="Parcelas a vencer por mês e saldo restante">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={upcoming} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={monthShort}
                  interval={upcoming.length > 8 ? 1 : 0}
                />
                <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={kTick} />
                <Tooltip
                  cursor={{ fill: "#141D33", opacity: 0.4 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = upcoming.find((item) => item.month === String(label));
                    if (!row) return null;
                    return (
                      <TooltipBox
                        title={monthShort(row.month)}
                        rows={[
                          { label: "Vence no mês", value: currency(row.amount), color: INVOICE_COLOR },
                          { label: "Ainda a pagar depois", value: currency(row.remainingAfter), color: OUTSTANDING_COLOR },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="amount" fill={INVOICE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Line
                  type="linear"
                  dataKey="remainingAfter"
                  stroke={OUTSTANDING_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: OUTSTANDING_COLOR, stroke: "#0E1526", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 border-t border-edge-soft pt-3 text-xs leading-[18px] text-muted">
            Sem compras novas, as parcelas já lançadas terminam em{" "}
            <strong className="font-semibold text-snow">{monthLong(upcoming[upcoming.length - 1].month)} de {upcoming[upcoming.length - 1].month.slice(0, 4)}</strong>.
            Nos próximos 3 meses vencem{" "}
            <strong className="font-semibold text-snow">{currency(upcoming.slice(0, 3).reduce((sum, row) => sum + row.amount, 0))}</strong>.
            {olderBases.length > 0 ? ` (${olderBases.join("; ")}.)` : ""}
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm text-muted">Nenhuma parcela a vencer nas declarações até {monthShort(asOf)}.</p>
      )}
    </section>
  );
}

function DebtSummary({
  current,
  previous,
  names,
}: {
  current: ReturnType<typeof debtRows>[number] | undefined;
  previous: ReturnType<typeof debtRows>[number] | null;
  names: (ids: string[]) => string;
}) {
  if (!current) return null;
  const sentences: ReactNode[] = [];
  if (current.missing.length > 0) {
    sentences.push(`Sem declaração de ${names(current.missing)} em ${monthLong(current.month)}, então o total do mês está incompleto.`);
  } else if (
    previous &&
    previous.missing.length === 0 &&
    previous.outstanding !== null &&
    current.outstanding !== null &&
    current.paidSincePrevious !== null &&
    current.newSincePrevious !== null
  ) {
    const added = current.newSincePrevious;
    sentences.push(
      <>
        Desde {monthLong(previous.month)}, venceram <strong className="font-semibold text-snow">{currency(current.paidSincePrevious)}</strong> em
        faturas e{" "}
        {added >= 0 ? (
          <>
            entraram <strong className="font-semibold text-snow">{currency(added)}</strong> em compras novas no cartão
          </>
        ) : (
          <>
            as parcelas futuras diminuíram <strong className="font-semibold text-snow">{currency(Math.abs(added))}</strong> (estornos ou ajustes)
          </>
        )}
        . O total a pagar foi de {currency(previous.outstanding)} para{" "}
        <strong className="font-semibold text-snow">{currency(current.outstanding)}</strong>.
      </>,
    );
  }
  if (current.invoice !== null && current.averageInvoice !== null && current.averageInvoice > 0) {
    const ratio = current.invoice / current.averageInvoice - 1;
    sentences.push(
      Math.abs(ratio) < 0.05
        ? `A fatura de ${monthLong(current.month)} (${currency(current.invoice)}) está na média dos últimos 12 meses.`
        : `A fatura de ${monthLong(current.month)} (${currency(current.invoice)}) está ${Math.round(Math.abs(ratio) * 100)}% ${ratio > 0 ? "acima" : "abaixo"} da média dos últimos 12 meses (${currency(current.averageInvoice)}).`,
    );
  }
  if (sentences.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-1.5 border-t border-edge-soft pt-3 text-xs leading-[18px] text-muted">
      {sentences.map((sentence, index) => (
        <p key={index}>{sentence}</p>
      ))}
    </div>
  );
}
