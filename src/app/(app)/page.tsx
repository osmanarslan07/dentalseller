import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getSettings } from "@/lib/data";
import {
  computeMonthlyAggregates,
  currentMonthKey,
  lastNMonths,
  monthLabel,
} from "@/lib/commission";
import { formatDate } from "@/lib/format";
import { Card, StatCard, StatusBadge } from "@/components/ui";
import { Money, Percent, PrivateEarningsChart, PrivacyToggleButton, TierSublabel } from "@/components/privacy";

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Your commission overview at a glance.</p>
        </div>
        <PrivacyToggleButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total earned to date"
          value={<Money value={totalActualCommission} currency={settings.currency} />}
          sublabel="Confirmed commission, actual payments"
        />
        <StatCard
          label="This month's earnings so far"
          value={<Money value={thisMonthAgg?.actualCommission ?? 0} currency={settings.currency} />}
          sublabel={
            <>
              From <Money value={thisMonthAgg?.actualTotal ?? 0} currency={settings.currency} /> received
            </>
          }
        />
        <StatCard
          label="This month's commission tier"
          value={<Percent value={thisMonthAgg?.actualRate ?? settings.tier1_rate} />}
          sublabel={<TierSublabel total={thisMonthAgg?.actualTotal ?? 0} settings={settings} />}
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
          <PrivateEarningsChart data={chartData} currency={settings.currency} />
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
                        {v.expected != null ? <Money value={v.expected} currency={settings.currency} /> : "—"}
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
                <th className="pb-2 pl-4 font-medium">Name</th>
                <th className="pb-2 font-medium">Treatment</th>
                <th className="pb-2 font-medium">Confirmed</th>
                <th className="pb-2 font-medium">First visit</th>
                <th className="pb-2 font-medium">Visit 2</th>
                <th className="pb-2 font-medium">Komo</th>
              </tr>
            </thead>
            <tbody>
              {patients.slice(0, 6).map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pl-4 font-medium text-slate-800">{p.name}</td>
                  <td className="py-2.5 text-slate-500">{p.treatment || "—"}</td>
                  <td className="py-2.5 text-slate-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-2.5 text-slate-500">
                    <div>{formatDate(p.visit1_date)}</div>
                    <StatusBadge status={p.visit1_status} />
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={p.visit2_status} />
                  </td>
                  <td className="py-2.5">
                    {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) ? (
                      <a
                        href={p.komo_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-teal-600 hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
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
