"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n";

export interface UsagePoint {
  /** Axis tick, e.g. "Sept" */
  short: string;
  /** Tooltip/table label, e.g. "Sept 2026" */
  label: string;
  quotesCreated: number;
  patientsConfirmed: number;
  activeUsers: number;
}

type Metric = "quotesCreated" | "patientsConfirmed" | "activeUsers";

const METRICS: { key: Metric; title: string; unit: string; note: string }[] = [
  { key: "quotesCreated", title: msg("Quotes created"), unit: msg("quotes"), note: msg("New quotes, by creation date") },
  { key: "patientsConfirmed", title: msg("Patients confirmed"), unit: msg("patients"), note: msg("By confirmation date") },
  { key: "activeUsers", title: msg("Active team members"), unit: msg("people"), note: msg("Did anything in the app that month") },
];

const TEAL = "#0d9488";
const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";

/** Three small single-series charts rather than one chart with a second axis — the
 * measures have different scales, and each one reads on its own. Counts only. */
export function UsageTrends({ title, data }: { title: string; data: UsagePoint[] }) {
  const [showTable, setShowTable] = useState(false);
  const t = useT();

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t(title)}</h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {showTable ? t("Show charts") : t("Show as table")}
        </button>
      </div>

      {showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4 font-medium">{t("Month")}</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="py-2 pr-4 text-right font-medium">
                    {t(m.title)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row) => (
                <tr key={row.label} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-4 text-slate-600">{row.label}</td>
                  {METRICS.map((m) => (
                    <td key={m.key} className="py-2 pr-4 text-right tabular-nums text-slate-900">
                      {row[m.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {METRICS.map((m) => (
            <MetricChart key={m.key} metric={m} data={data} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MetricChart({ metric, data }: { metric: (typeof METRICS)[number]; data: UsagePoint[] }) {
  const latest = data[data.length - 1];
  const t = useT();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{t(metric.title)}</h3>
        {latest && (
          <span className="text-sm tabular-nums text-slate-900">
            <span className="font-semibold">{latest[metric.key]}</span>
            <span className="text-slate-400"> this month</span>
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400">{metric.note}</p>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="short"
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value) => [`${value} ${t(metric.unit)}`, t(metric.title)]}
              // text stays in normal ink — the bar beside it already carries the teal
              itemStyle={{ color: "#0f172a" }}
              labelStyle={{ color: AXIS_TEXT }}
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${GRID}`,
                fontSize: 13,
                boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
              }}
            />
            <Bar dataKey={metric.key} fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
