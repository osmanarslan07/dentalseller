"use client";

import { useMemo, useState } from "react";
import { Patient, CommissionSettings } from "@/types";
import { computeMonthlyAggregates, monthKey, monthLabel } from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import { Card, Select } from "@/components/ui";

export function CloseoutSummary({
  patients,
  settings,
  months,
  defaultMonth,
}: {
  patients: Patient[];
  settings: CommissionSettings;
  months: string[];
  defaultMonth: string;
}) {
  const [month, setMonth] = useState(defaultMonth);

  const aggregateMap = useMemo(() => {
    const aggregates = computeMonthlyAggregates(patients, settings);
    return new Map(aggregates.map((a) => [a.month, a]));
  }, [patients, settings]);

  const stats = useMemo(() => {
    let confirmed = 0;
    let visit1Done = 0;
    let visit2Done = 0;
    let paymentsReceived = 0;

    for (const p of patients) {
      if (p.confirmation_date && monthKey(p.confirmation_date) === month) confirmed++;
      if (p.visit1_date && monthKey(p.visit1_date) === month && p.visit1_status === "completed") visit1Done++;
      if (p.visit2_date && monthKey(p.visit2_date) === month && p.visit2_status === "completed") visit2Done++;
      if (p.visit1_date && monthKey(p.visit1_date) === month && p.visit1_actual != null) paymentsReceived++;
      if (p.visit2_date && monthKey(p.visit2_date) === month && p.visit2_actual != null) paymentsReceived++;
    }

    const agg = aggregateMap.get(month);
    return {
      confirmed,
      visitsDone: visit1Done + visit2Done,
      paymentsReceived,
      paymentsTotal: agg?.actualTotal ?? 0,
      commission: agg?.actualCommission ?? 0,
    };
  }, [patients, month, aggregateMap]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Monthly close-out</h2>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[160px]">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Patients confirmed</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.confirmed}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Visits completed</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.visitsDone}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Payments received</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {stats.paymentsReceived}
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({formatCurrency(stats.paymentsTotal, settings.currency)})
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Commission earned</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatCurrency(stats.commission, settings.currency)}
          </p>
        </div>
      </div>
    </Card>
  );
}
