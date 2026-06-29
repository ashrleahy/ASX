"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type EquityPoint = { date: string; strategy: number; benchmark: number };

export default function EquityChart({ data }: { data: EquityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#2a3140" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#8b93a3", fontSize: 11 }}
          tickFormatter={(d: string) => d.slice(0, 7)}
          minTickGap={40}
        />
        <YAxis tick={{ fill: "#8b93a3", fontSize: 11 }} width={48} />
        <Tooltip
          contentStyle={{
            background: "#161b24",
            border: "1px solid #2a3140",
            fontSize: 12,
          }}
          labelStyle={{ color: "#e8e3d8" }}
        />
        <Line
          type="monotone"
          dataKey="strategy"
          name="Momentum strategy"
          stroke="#d4a24c"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="ASX 200"
          stroke="#8b93a3"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
