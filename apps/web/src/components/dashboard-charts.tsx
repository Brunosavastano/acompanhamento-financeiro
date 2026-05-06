"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { currency, number, percent } from "@/lib/format";

type ChartPoint = Record<string, string | number>;

const colors = ["#35d8ff", "#58f28a", "#ff4f91", "#ffb84d"];

export function NetWorthChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="netWorth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#35d8ff" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#35d8ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#22314b" strokeDasharray="3 3" />
        <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => currency(Number(value)).replace(",00", "")} />
        <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #22314b", borderRadius: 8 }} formatter={(value) => currency(Number(value))} />
        <Area type="monotone" dataKey="value" stroke="#35d8ff" fill="url(#netWorth)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CompositionChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} innerRadius={72} outerRadius={105} dataKey="value" nameKey="name" paddingAngle={3}>
          {data.map((_entry, index) => (
            <Cell key={index} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #22314b", borderRadius: 8 }} formatter={(value) => currency(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function VariationChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid stroke="#22314b" strokeDasharray="3 3" />
        <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => currency(Number(value)).replace(",00", "")} />
        <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #22314b", borderRadius: 8 }} formatter={(value) => currency(Number(value))} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={Number(entry.value) >= 0 ? "#58f28a" : "#ff4f91"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RatioChart({ data, dataKey = "value", formatter = percent }: { data: ChartPoint[]; dataKey?: string; formatter?: (value: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid stroke="#22314b" strokeDasharray="3 3" />
        <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => formatter(Number(value))} />
        <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #22314b", borderRadius: 8 }} formatter={(value) => formatter(Number(value))} />
        <Area type="monotone" dataKey={dataKey} stroke="#ffb84d" fill="#ffb84d33" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ReserveChart({ data }: { data: ChartPoint[] }) {
  return <RatioChart data={data} formatter={(value) => `${number(value, 1)}x`} />;
}
