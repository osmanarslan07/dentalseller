import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getSettings } from "@/lib/data";
import {
  computeMonthlyAggregates,
  currentMonthKey,
  lastNMonths,
  monthLabel,
} from "@/lib/commission";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { Card, StatCard, StatusBadge } from "@/components/ui";
import { EarningsChart } from "@/components/EarningsChart";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [patients, settings] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase),
  ]);

  const aggregates = computeMonthlyAggregates(patients, settings);
  const aggregateMap = new Map(aggregates.map((a) => [a.month, a]));

  const totalActualCommission = aggregates.reduce((sum, a) => sum + a.actualCommission, 0);
  const thisMonth = currentMonthKey();
  const thisMonthAgg = aggregateMap.get(thisMonth);

  const totalPatients = patients.length;
  const patientsThisMonth = patients.filter(
    (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === thisMonth
  ).length;

  const chartMonths = lastNMonths(12);
  const chartData = chartMonths.map((m) => {
    const a = aggregateMap.get(m);
    return {
      label: monthLabel(m),
      actual: a?.actualCommission ?? 0,
      expected: a?.expectedCommission ?? 0,
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthAhead = new Date(today);
  monthAhead.setMonth(monthAhead.getMonth() + 1);

  type UpcomingVisit = {
    patientName: string;
    patientId: string;
    treatment: string | null;
    visitLabel: string;
    date: string;
    daysLeft: number;
    expected: number | null;
  };

  const upcoming: UpcomingVisit[] = [];
  for (const p of patients) {
    for (const [label, date, status, expected] of [
      ["Visit 1", p.visit1_date, p.visit1_status, p.visit1_expected],
      ["Visit 2", p.visit2_date, p.visit2_status, p.visit2_expected],
    ] as const) {
      if (!date || status !== "upcoming") continue;
      const d = new Date(date);
      if (d >= today && d <= monthAhead) {
        const daysLeft = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        upcoming.push({
          patientName: p.name,
          patientId: p.id,
          treatment: p.treatment,
          visitLabel: label,
          date,
          daysLeft,
          expected,
        });
      }
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Your commission overview at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total earned to date"
          value={formatCurrency(totalActualCommission, settings.currency)}
          sublabel="Confirmed commission, actual payments"
        />
        <StatCard
          label="This month's earnings so far"
          value={formatCurrency(thisMonthAgg?.actualCommission ?? 0, settings.currency)}
          sublabel={`From ${formatCurrency(thisMonthAgg?.actualTotal ?? 0, settings.currency)} received`}
        />
        <StatCard
          label="This month's commission tier"
          value={formatPercent(
            thisMonthAgg?.actualRate ?? settings.low_tier_rate
          )}
          sublabel={
            (thisMonthAgg?.actualTotal ?? 0) > settings.low_tier_threshold
              ? `Above ${formatCurrency(settings.low_tier_threshold, settings.currency)} threshold`
              : `Up to ${formatCurrency(settings.low_tier_threshold, settings.currency)} threshold`
          }
        />
        <StatCard
          label="Patients sold"
          value={totalPatients}
          sublabel={`${patientsThisMonth} confirmed this month`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Earnings by month</h2>
            <span className="text-xs text-slate-400">Last 12 months</span>
          </div>
          <EarningsChart data={chartData} currency={settings.currency} />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Upcoming visits this month</h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No visits scheduled this month.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((v, i) => (
                <li key={i}>
                  <Link
                    href={`/patients?q=${encodeURIComponent(v.patientName)}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{v.patientName}</p>
                      <p className="text-xs text-slate-500">
                        {v.visitLabel} · {formatDate(v.date)}
                        {v.treatment ? ` · ${v.treatment}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block text-sm font-medium text-slate-700">
                        {v.expected != null ? formatCurrency(v.expected, settings.currency) : "—"}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {v.daysLeft === 0
                          ? "Today"
                          : v.daysLeft === 1
                          ? "Tomorrow"
                          : `${v.daysLeft} days`}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent patients</h2>
          <Link href="/patients" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Treatment</th>
                <th className="pb-2 font-medium">Confirmed</th>
                <th className="pb-2 font-medium">Visit 1</th>
                <th className="pb-2 font-medium">Visit 2</th>
              </tr>
            </thead>
            <tbody>
              {patients.slice(0, 6).map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">
                    {p.name}
                    {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) && (
                      <a
                        href={p.komo_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Komo"
                        className="ml-1.5 text-xs font-normal text-teal-600 hover:underline"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-500">{p.treatment || "—"}</td>
                  <td className="py-2.5 text-slate-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-2.5">
                    <StatusBadge status={p.visit1_status} />
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={p.visit2_status} />
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No patients yet.{" "}
                    <Link href="/patients" className="text-teal-600 hover:underline">
                      Add your first patient
                    </Link>
                    .
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
