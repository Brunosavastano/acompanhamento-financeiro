"use client";

import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency } from "@/lib/format";
import {
  COMBINABLE_KEYS,
  FAMILY_SCOPE,
  SUMMARY_KEYS,
  SUMMARY_LABELS,
  accountSeries,
  combinedLabel,
  combinedValue,
  debtRows,
  outlookRows,
  summaryRows,
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

/** Evolução do patrimônio por pessoa, com séries escolhidas e a evolução de cada conta. */
export function EvolutionExplorer({ data }: { data: EvolutionData }) {
  const [scope, setScope] = useState<Scope>(FAMILY_SCOPE);
  const [selected, setSelected] = useState<SummaryKey[]>([...SUMMARY_KEYS]);
  const [combine, setCombine] = useState(false);
  const [window, setWindow] = useState<WindowKey>("12");

  const rows = useMemo(() => windowed(summaryRows(data, scope), window), [data, scope, window]);
  const accounts = useMemo(() => {
    const windowedData = { accounts: data.accounts, months: windowed(data.months, window) };
    return accountSeries(windowedData, scope);
  }, [data, scope, window]);

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
        <ScopeToggle people={data.people} value={scope} onChange={setScope} label="Pessoa da evolução" />
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
            <span className="text-xs text-faint">variação em relação ao mês anterior</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            {accounts.map((series) => {
              const delta = series.previous === null ? null : series.current - series.previous;
              return (
                <div key={series.account.key} className="min-w-0 rounded-[10px] border border-edge-soft bg-surface-2 px-3 py-2.5 sm:px-3.5 sm:py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-body">
                      {scope === FAMILY_SCOPE ? `${peopleById.get(series.account.personId) ?? ""} · ` : ""}
                      {series.account.name}
                    </span>
                    <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{ACCOUNT_CATEGORY_LABELS[series.account.category]}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[14px] font-semibold tabular-nums text-snow sm:text-[15px]">{brl0(series.current)}</span>
                    {delta !== null ? (
                      <span
                        className={clsx(
                          "text-[11px] font-semibold tabular-nums",
                          delta > 0 ? "text-positive-text" : delta < 0 ? "text-negative-text" : "text-faint",
                        )}
                      >
                        {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                        {brl0(Math.abs(delta))}
                      </span>
                    ) : null}
                  </div>
                  {series.points.length >= 2 ? (
                    <div className="mt-2 h-[40px]" aria-hidden>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series.points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Line type="linear" dataKey="value" stroke={SPARK_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Dívidas ao longo do tempo: total a pagar, fatura de cada mês e o que ainda vai vencer. */
export function DebtEvolutionPanel({ data }: { data: EvolutionData }) {
  const [scope, setScope] = useState<Scope>(FAMILY_SCOPE);
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle people={data.people} value={scope} onChange={setScope} label="Pessoa das dívidas" />
        {tab === "historico" ? <ChartWindowToggle value={window} onChange={setWindow} /> : null}
      </div>

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
