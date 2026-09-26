"use client";

import { useState } from "react";
import { monthLabel } from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import { Card, Select } from "@/components/ui";
import { Money } from "@/components/privacy";
import { useCurrencies } from "@/components/currency";
import { useLocale, useT } from "@/i18n/client";
import type { CloseoutStats } from "./closeout";

export function CloseoutSummary({
  statsByMonth,
  months,
  defaultMonth,
}: {
  /** Worked out on the server (closeoutStats) for every month in `months`. */
  statsByMonth: Record<string, CloseoutStats>;
  months: string[];
  defaultMonth: string;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const t = useT();
  const locale = useLocale();
  const { main: currency } = useCurrencies();
  const stats = statsByMonth[month] ?? statsByMonth[defaultMonth];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t("Monthly close-out")}</h2>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[160px]">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, locale)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">{t("Patients confirmed")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.confirmed}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("Visits completed")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.visitsDone}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("Payments received")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {stats.paymentsReceived}
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({formatCurrency(stats.paymentsTotal, currency)})
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("Commission earned")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            <Money value={stats.commission} currency={currency} />
          </p>
        </div>
      </div>
    </Card>
  );
}
