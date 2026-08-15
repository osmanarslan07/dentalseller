"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface DataPoint {
  label: string;
  actual: number;
  expected: number;
}

export function EarningsChart({ data, currency }: { data: DataPoint[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={{ stroke: "#e2e8f0" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency).replace(/\.00$/, "")}
          width={64}
        />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          formatter={(value) => formatCurrency(Number(value), currency)}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="actual" name="Actual commission" fill="#0d9488" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expected" name="Expected commission" fill="#94a3b8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
