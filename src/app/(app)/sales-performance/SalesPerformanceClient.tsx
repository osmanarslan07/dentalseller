"use client";

import { useRouter } from "next/navigation";
import { Badge, Card, Select } from "@/components/ui";
import { Money } from "@/components/privacy";

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

interface MonthOption {
  value: string;
  label: string;
}

export function SalesPerformanceClient({
  rows,
  selectedMonth,
  selectedMonthLabel,
  monthOptions,
}: {
  rows: Row[];
  selectedMonth: string;
  selectedMonthLabel: string;
  monthOptions: MonthOption[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sales performance</h1>
          <p className="mt-1 text-sm text-slate-500">Every seller&apos;s sales and commission. Only people whose role allows it see this page.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Month</label>
          <Select
            value={selectedMonth}
            onChange={(e) => router.push(`/sales-performance?month=${e.target.value}`)}
            className="w-40"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

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

    </div>
  );
}
