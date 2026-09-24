"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card, Select } from "@/components/ui";
import { Money } from "@/components/privacy";
import { formatActivityTime } from "@/lib/activity-log";

interface Row {
  /** `role` null = a seller without an account (patients entered for them by a coordinator). */
  seller: { id: string; name: string | null; role: "admin" | "seller" | null; isActive: boolean };
  currency: string;
  patientCount: number;
  patientsSoldInMonth: number;
  patientsCameInMonth: number;
  paidInMonth: number;
  commissionInMonth: number;
}

interface ActivityEntry {
  id: string;
  createdAt: string;
  description: string;
}

interface MonthOption {
  value: string;
  label: string;
}

export function TeamPerformanceClient({
  rows,
  activity,
  selectedMonth,
  selectedMonthLabel,
  monthOptions,
}: {
  /** null: not allowed to see earnings / activity */
  rows: Row[] | null;
  activity: ActivityEntry[] | null;
  selectedMonth: string;
  selectedMonthLabel: string;
  monthOptions: MonthOption[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{rows ? "Team performance" : "Team activity"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows ? "Every seller’s sales and commission." : "What the team has been doing."} Only people whose role allows it see this page.
          </p>
        </div>
        {rows && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Month</label>
          <Select
            value={selectedMonth}
            onChange={(e) => router.push(`/team?month=${e.target.value}`)}
            className="w-40"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        )}
      </div>

      {rows && (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 pr-4 font-medium">Seller</th>
                <th className="py-3 pr-4 font-medium">Sold in {selectedMonthLabel}</th>
                <th className="py-3 pr-4 font-medium">Came in {selectedMonthLabel}</th>
                <th className="py-3 pr-4 font-medium">Paid in {selectedMonthLabel}</th>
                <th className="py-3 pr-4 font-medium">Commission in {selectedMonthLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seller.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pl-4 pr-4 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {r.seller.name || "Invited — awaiting first login"}
                      {r.seller.role === "admin" && <Badge tone="blue">Admin</Badge>}
                      {r.seller.role === null && <Badge tone="slate">No account</Badge>}
                      {!r.seller.isActive && <Badge tone="amber">Inactive</Badge>}
                    </span>
                    <div className="text-xs font-normal text-slate-400">{r.patientCount} patients total</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{r.patientsSoldInMonth}</td>
                  <td className="py-3 pr-4 text-slate-600">{r.patientsCameInMonth}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    <Money value={r.paidInMonth} currency={r.currency} showConversion={false} />
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    <Money value={r.commissionInMonth} currency={r.currency} showConversion={false} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No sellers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {activity && (
      <Card className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <Link href="/activity" className="text-sm font-medium text-teal-700 hover:underline">
            Full history →
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="text-slate-700">{entry.description}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatActivityTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}
    </div>
  );
}
