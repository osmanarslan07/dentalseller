"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExchangeRatePoint } from "@/lib/data";

export function RateHistoryChart({ data, base }: { data: ExchangeRatePoint[]; base: string }) {
  if (data.length < 2) {
    return <p className="text-sm text-slate-400">Not enough history yet — check back after a few days.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="rate_date"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={{ stroke: "#e2e8f0" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toFixed(2)} ₺`, `1 ${base}`]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
          }}
        />
        <Line type="monotone" dataKey="rate" stroke="#0d9488" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
