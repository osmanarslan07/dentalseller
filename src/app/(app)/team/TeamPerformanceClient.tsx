"use client";

import { Badge, Card } from "@/components/ui";
import { Money } from "@/components/privacy";
import { Profile } from "@/types";

interface Row {
  seller: Profile;
  currency: string;
  patientCount: number;
  thisMonthActual: number;
  totalActual: number;
  totalExpected: number;
}

export function TeamPerformanceClient({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team performance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Admin-only — every seller&apos;s commission. Not visible to anyone else.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 pr-4 font-medium">Seller</th>
                <th className="py-3 pr-4 font-medium">Patients</th>
                <th className="py-3 pr-4 font-medium">This month</th>
                <th className="py-3 pr-4 font-medium">Total earned</th>
                <th className="py-3 pr-4 font-medium">Total expected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seller.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pl-4 pr-4 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {r.seller.display_name || "Invited — awaiting first login"}
                      {r.seller.role === "admin" && <Badge tone="blue">Admin</Badge>}
                      {!r.seller.is_active && <Badge tone="amber">Inactive</Badge>}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{r.patientCount}</td>
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    <Money value={r.thisMonthActual} currency={r.currency} showConversion={false} />
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    <Money value={r.totalActual} currency={r.currency} showConversion={false} />
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    <Money value={r.totalExpected} currency={r.currency} showConversion={false} />
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
