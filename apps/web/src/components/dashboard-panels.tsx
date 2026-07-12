"use client";

import { useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { currency } from "@/lib/format";

type Point = { month: string; value: number };

const GOLD = "#C9A96E";
const GOLD_LIGHT = "#E3C98E";
const POSITIVE = "#5BCB8D";
const NEGATIVE = "#E0688F";
const INFO = "#6E9BD8";
const STEEL = "#3A4A6B";
const GRID = "#182238";
const TICK = { fill: "#5C687F", fontSize: 12 };

const tooltipContentStyle: CSSProperties = {
  backgroundColor: "#0B1120",
  border: "1px solid #1F2A42",
  borderRadius: 8,
  color: "#EEF2FA",
  fontSize: 12,
};
const tooltipLabelStyle: CSSProperties = { color: "#8B96AD", fontWeight: 600 };
const tooltipItemStyle: CSSProperties = { color: "#EEF2FA" };

function brl0(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

/** "2024-10" → "out/24" */
function monthShort(month: string) {
  const [year, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, m - 1, 1)))
    .replace(".", "");
  return `${label}/${String(year).slice(2)}`;
}

function lastPointDot(length: number) {
  return function LastPointDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={index === length - 1 ? 4.5 : 0}
        fill={GOLD_LIGHT}
        stroke="none"
      />
    );
  };
}

/**
 * Rótulo em forma de chip (retângulo #141D33 com borda) usado nas anotações
 * dos gráficos, replicando os chips desenhados no protótipo.
 */
function ChipLabel(props: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  text?: string;
  color?: string;
  fontSize?: number;
  anchor?: "point" | "lineEnd";
}) {
  const { viewBox = {}, text = "", color = "#EEF2FA", fontSize = 12, anchor = "point" } = props;
  const width = Math.round(text.length * fontSize * 0.56 + 20);
  const height = fontSize + 12;
  const vx = viewBox.x ?? 0;
  const vy = viewBox.y ?? 0;
  const x = Math.max(anchor === "point" ? vx - width - 8 : vx + (viewBox.width ?? 0) - width - 8, 4);
  const y = Math.max(anchor === "point" ? vy - height / 2 - 16 : vy + 8, 4);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill="#141D33" stroke="#1F2A42" />
      <text x={x + width / 2} y={y + height / 2 + fontSize * 0.36} textAnchor="middle" fill={color} fontSize={fontSize} fontWeight={600}>
        {text}
      </text>
    </g>
  );
}

export function HeroSparkline({ data }: { data: Point[] }) {
  if (data.length < 2) return null;
  return (
    <div className="mt-5 h-[120px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.3} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="linear"
            dataKey="value"
            stroke={GOLD}
            strokeWidth={2.5}
            fill="url(#heroFill)"
            dot={lastPointDot(data.length)}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const WINDOWS = [
  { key: "6", label: "6 meses" },
  { key: "12", label: "12 meses" },
  { key: "all", label: "Tudo" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

export function ChartWindowToggle({
  value,
  onChange,
}: {
  value: WindowKey;
  onChange: (value: WindowKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-[3px]">
      {WINDOWS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={clsx(
            "focus-ring rounded-md px-3 py-[5px] text-xs font-semibold",
            option.key === value ? "bg-elevated text-snow" : "text-muted hover:text-snow",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EvolutionPanel({ data }: { data: Point[] }) {
  const [window, setWindow] = useState<WindowKey>("12");
  const visible = window === "all" ? data : data.slice(-Number(window));

  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-lg font-normal text-snow">Evolução do patrimônio</h2>
        <ChartWindowToggle value={window} onChange={setWindow} />
      </div>
      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visible} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
                <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="month"
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tickFormatter={monthShort}
              interval={visible.length > 8 ? 1 : 0}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={64}
              domain={[(dataMin: number) => dataMin * 0.98, (dataMax: number) => dataMax * 1.01]}
              tickFormatter={(value: number) => `${Math.round(value / 1000)} mil`}
            />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(value) => [currency(Number(value)), "Patrimônio"]}
              labelFormatter={(label) => monthShort(String(label))}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke={GOLD}
              strokeWidth={2.5}
              fill="url(#evoFill)"
              dot={lastPointDot(visible.length)}
              activeDot={{ r: 4.5, fill: GOLD_LIGHT, stroke: "none" }}
              isAnimationActive={false}
            />
            {visible.length > 0 ? (
              <ReferenceDot
                x={visible[visible.length - 1].month}
                y={visible[visible.length - 1].value}
                r={0}
                fill="none"
                stroke="none"
                label={<ChipLabel text={brl0(visible[visible.length - 1].value)} anchor="point" />}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function VariationPanel({ data, average }: { data: Point[]; average: number | null }) {
  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-normal text-snow">Variação mensal</h2>
        <span className="text-xs text-faint">quanto o patrimônio mudou em cada mês</span>
      </div>
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="month"
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tickFormatter={monthShort}
              interval={data.length > 8 ? 1 : 0}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) => (value === 0 ? "0" : `${Math.round(value / 1000)} mil`)}
            />
            <Tooltip
              cursor={{ fill: "#141D33", opacity: 0.4 }}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(value) => [currency(Number(value)), "Variação"]}
              labelFormatter={(label) => monthShort(String(label))}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.value >= 0 ? POSITIVE : NEGATIVE} />
              ))}
            </Bar>
            {average !== null ? (
              <ReferenceLine
                y={average}
                stroke={GOLD}
                strokeWidth={1.5}
                strokeDasharray="6 5"
                label={
                  <ChipLabel
                    text={`média ${average >= 0 ? "+" : "-"}${brl0(Math.abs(average))}/mês`}
                    color={GOLD_LIGHT}
                    fontSize={11}
                    anchor="lineEnd"
                  />
                }
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export type CompositionScopeView = {
  id: string;
  label: string;
  investments: number;
  cash: number;
  benefits: number;
  total: number;
  debtPvTotal: number;
};

const SLICE_META = [
  { key: "investments", name: "Investimentos", color: GOLD },
  { key: "cash", name: "Caixa e contas", color: INFO },
  { key: "benefits", name: "Benefícios e cashback", color: STEEL },
] as const;

export function CompositionPanel({ scopes }: { scopes: CompositionScopeView[] }) {
  const [selectedId, setSelectedId] = useState(scopes[0]?.id ?? "familia");
  const scope = scopes.find((item) => item.id === selectedId) ?? scopes[0];
  if (!scope) return null;

  const slices = SLICE_META.map((meta) => ({ ...meta, value: scope[meta.key] })).filter((slice) => slice.value > 0);
  const pct = (value: number) => (scope.total > 0 ? (value / scope.total) * 100 : 0);
  const firstName = (label: string) => label.split(" ")[0];

  return (
    <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-normal text-snow">De onde vem o patrimônio</h2>
        <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-[3px]">
          {scopes.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedId(option.id)}
              className={clsx(
                "focus-ring rounded-md px-3 py-[5px] text-xs font-semibold",
                option.id === scope.id ? "bg-elevated text-snow" : "text-muted hover:text-snow",
              )}
            >
              {option.id === "familia" ? option.label : firstName(option.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 text-[13px] text-muted">
        {scope.id === "familia" ? "Total da família: " : `Total de ${firstName(scope.label)}: `}
        <strong className="font-semibold tabular-nums text-snow">{currency(scope.total)}</strong>
      </div>

      {slices.length > 0 ? (
        <>
          <div className="mt-3.5 flex h-3.5 overflow-hidden rounded-full bg-elevated">
            {slices.map((slice) => (
              <span key={slice.key} style={{ width: `${pct(slice.value)}%`, background: slice.color }} />
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {slices.map((slice) => (
              <div key={slice.key} className="flex items-center gap-2.5 text-[13px]">
                <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: slice.color }} />
                <span className="text-body">{slice.name}</span>
                <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-snow">{brl0(slice.value)}</span>
                <span className="w-11 text-right tabular-nums text-faint">{pct(slice.value).toFixed(1).replace(".", ",")}%</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">Sem posições registradas para este recorte.</p>
      )}

      <p className="mt-4 border-t border-edge-soft pt-3 text-xs text-muted">
        {scope.debtPvTotal > 0 ? (
          scope.id === "familia" ? (
            <>
              As faturas futuras do cartão descontam{" "}
              <strong className="font-semibold text-negative-text">{currency(scope.debtPvTotal)}</strong> deste total.
            </>
          ) : (
            <>
              As faturas futuras do cartão de {firstName(scope.label)} somam{" "}
              <strong className="font-semibold text-negative-text">{currency(scope.debtPvTotal)}</strong>.
            </>
          )
        ) : (
          "Sem faturas futuras de cartão registradas."
        )}
      </p>
    </section>
  );
}
