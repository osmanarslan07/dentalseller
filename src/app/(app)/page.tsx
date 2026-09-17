import { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import {
  addMonths,
  computeMonthlyAggregates,
  computeUnscheduledExpectedTotal,
  currentMonthKey,
  lastNMonths,
  monthLabel,
} from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import { Card, StatCard } from "@/components/ui";
import { Money, PrivateEarningsChart } from "@/components/privacy";
import { CountUp } from "@/components/CountUp";
import { RelativeTime } from "@/components/RelativeTime";
import { DASHBOARD_CARDS, DashboardCardId } from "@/lib/dashboard-cards";
import { Patient } from "@/types";
import { TeamOperationsPanel } from "./TeamOperationsPanel";

function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12.5h2.5a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5H16a2 2 0 0 1 0-4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 8V6.8A1.8 1.8 0 0 1 5.3 5h9.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendingUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3.5 16.5 9.5 10.5 13.5 14.5 20.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 7.5h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HourglassIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3.5h12M6 20.5h12" strokeLinecap="round" />
      <path d="M7 3.5v3.2c0 1.7 1.9 3.4 5 5.3 3.1-1.9 5-3.6 5-5.3V3.5M7 20.5v-3.2c0-1.7 1.9-3.4 5-5.3 3.1 1.9 5 3.6 5 5.3v3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20c.6-3.4 3-5.3 5.5-5.3s4.9 1.9 5.5 5.3" strokeLinecap="round" />
      <path d="M15.5 6.2c1.4.3 2.5 1.6 2.5 3.1s-1.1 2.8-2.5 3.1" strokeLinecap="round" />
      <path d="M16.5 14.9c2 .5 3.5 2.2 4 5.1" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserPlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9.5" cy="8" r="3.25" />
      <path d="M3.5 20c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" strokeLinecap="round" />
      <path d="M18 7.5v5M15.5 10h5" strokeLinecap="round" />
    </svg>
  );
}

function PlaneIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M14 3.5c1 0 1.8.8 1.8 1.8v4.4l5 3v2l-5-1.4v3.8l2 1.4v1.6l-3.5-1-3.5 1v-1.6l2-1.4v-3.8l-5 1.4v-2l5-3V5.3c0-1 .8-1.8 1.8-1.8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PercentIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 18 18 6" strokeLinecap="round" />
      <circle cx="7.5" cy="7.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
    </svg>
  );
}

function TagIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11.5 3.5H6a2.5 2.5 0 0 0-2.5 2.5v5.5L13 21l7.5-7.5L11.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.25" />
    </svg>
  );
}

function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5.5H4.5v1a3.5 3.5 0 0 0 3.5 3.5M17 5.5h2.5v1a3.5 3.5 0 0 1-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v3M9 20.5h6M9.5 20.5l.7-3.5h3.6l.7 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function treatmentTotal(p: Patient): number {
  const extra = p.extra_visits.reduce((sum, v) => sum + (v.expected ?? 0), 0);
  return (p.visit1_expected ?? 0) + (p.visit2_expected ?? 0) + extra;
}

export default async function DashboardPage() {
  const updatedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [allPatients, settings, profiles] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
  ]);
  // The stat cards/chart below are each seller's own performance view — commission/earnings
  // must never leak another seller's numbers, so they stay scoped to "mine". The operational
  // panel further down (upcoming events, follow-ups, logistics, unpaid amounts) reveals no
  // commission — those numbers are already visible to everyone on /patients — so it can show
  // the whole shared roster via its own Mine/Whole-team toggle.
  const patients = allPatients.filter((p) => p.responsible_seller_id === user?.id);

  // Money figures are computed from ALL patients (not the filtered list above) so a seller
  // keeps credit for commission already earned on a patient that's since been reassigned
  // away — reassignment only affects who owns still-unpaid visits going forward.
  const aggregates = computeMonthlyAggregates(allPatients, settings, user?.id ?? "");
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
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

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
    const visitEntries: readonly (readonly [string, string | null, "upcoming" | "completed", number | null])[] = [
      ["Visit 1", p.visit1_date, p.visit1_status, p.visit1_expected],
      ["Visit 2", p.visit2_date, p.visit2_status, p.visit2_expected],
      ...p.extra_visits.map((v) => [v.label, v.visit_date, v.status, v.expected] as const),
    ];
    for (const [label, date, status, expected] of visitEntries) {
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

  const monthAheadIso = `${monthAhead.getFullYear()}-${String(monthAhead.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(monthAhead.getDate()).padStart(2, "0")}`;

  const lastMonth = addMonths(thisMonth, -1);
  const patientsLastMonth = patients.filter(
    (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === lastMonth
  ).length;
  const newPatientsDelta = patientsThisMonth - patientsLastMonth;

  // Visits with no date yet (e.g. visit2 not booked) are excluded from the per-month
  // aggregates/chart so they don't skew a specific month's bar — add them back in here,
  // valued at the current month's rate, so dashboard totals still reflect all confirmed work.
  const unscheduledExpectedTotal = computeUnscheduledExpectedTotal(allPatients, user?.id ?? "");
  const unscheduledExpectedCommission = unscheduledExpectedTotal * (thisMonthAgg?.expectedRate ?? 0);

  const totalExpectedCommission =
    aggregates.reduce((sum, a) => sum + a.expectedCommission, 0) + unscheduledExpectedCommission;
  const outstandingExpected = totalExpectedCommission - totalActualCommission;

  const upcomingValue = upcoming.reduce((sum, v) => sum + (v.expected ?? 0), 0);

  const avgCommissionPerPatient = totalPatients > 0 ? totalActualCommission / totalPatients : 0;
  const avgTreatmentValue =
    totalPatients > 0 ? patients.reduce((sum, p) => sum + treatmentTotal(p), 0) / totalPatients : 0;

  const highestValuePatient = patients
    .filter((p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === thisMonth)
    .reduce<{ name: string; value: number } | null>((best, p) => {
      const value = treatmentTotal(p);
      return !best || value > best.value ? { name: p.name, value } : best;
    }, null);

  const cardsById: Record<DashboardCardId, ReactNode> = {
    total_earned: (
      <StatCard
        label="Total earned to date"
        value={<Money value={totalActualCommission} currency={settings.currency} animate />}
        sublabel="Confirmed commission, actual payments"
        icon={<WalletIcon className="h-4 w-4" />}
      />
    ),
    total_commission: (
      <StatCard
        label="Total commission (earned + expected)"
        value={<Money value={totalActualCommission + totalExpectedCommission} currency={settings.currency} animate />}
        sublabel={
          <>
            <Money value={totalActualCommission} currency={settings.currency} showConversion={false} /> earned +{" "}
            <Money value={totalExpectedCommission} currency={settings.currency} showConversion={false} /> expected
          </>
        }
        icon={<LayersIcon className="h-4 w-4" />}
      />
    ),
    month_earnings: (
      <StatCard
        label="This month's earnings so far"
        value={<Money value={thisMonthAgg?.actualCommission ?? 0} currency={settings.currency} animate />}
        sublabel={`From ${formatCurrency(thisMonthAgg?.actualTotal ?? 0, settings.currency)} received`}
        icon={<TrendingUpIcon className="h-4 w-4" />}
      />
    ),
    expected_earnings: (
      <StatCard
        label="Total expected earnings"
        value={<Money value={outstandingExpected} currency={settings.currency} animate />}
        sublabel="Remaining commission across confirmed treatment plans"
        icon={<HourglassIcon className="h-4 w-4" />}
      />
    ),
    patients_sold: (
      <StatCard
        label="Total patients sold"
        value={<CountUp value={totalPatients} />}
        sublabel={`${patientsThisMonth} confirmed this month`}
        icon={<PeopleIcon className="h-4 w-4" />}
      />
    ),
    confirmed_this_month: (
      <StatCard
        label="Confirmed this month"
        value={<CountUp value={patientsThisMonth} />}
        sublabel={monthLabel(thisMonth)}
        icon={<CheckCircleIcon className="h-4 w-4" />}
      />
    ),
    new_patients_delta: (
      <StatCard
        label="New patients vs last month"
        value={
          <CountUp value={newPatientsDelta} signed />
        }
        sublabel={`${patientsThisMonth} this month, ${patientsLastMonth} last month`}
        icon={<UserPlusIcon className="h-4 w-4" />}
      />
    ),
    upcoming_visits_value: (
      <StatCard
        label="Upcoming visits value (30 days)"
        value={<Money value={upcomingValue} currency={settings.currency} animate />}
        sublabel={`${upcoming.length} visit${upcoming.length === 1 ? "" : "s"} scheduled`}
        icon={<PlaneIcon className="h-4 w-4" />}
      />
    ),
    avg_commission_patient: (
      <StatCard
        label="Average commission per patient"
        value={<Money value={avgCommissionPerPatient} currency={settings.currency} animate />}
        sublabel={`Across ${totalPatients} patients`}
        icon={<PercentIcon className="h-4 w-4" />}
      />
    ),
    avg_treatment_value: (
      <StatCard
        label="Average treatment value per patient"
        value={<Money value={avgTreatmentValue} currency={settings.currency} animate />}
        sublabel="Visit 1 + visit 2 expected total"
        icon={<TagIcon className="h-4 w-4" />}
      />
    ),
    highest_value_patient: (
      <StatCard
        label="Highest-value patient this month"
        value={highestValuePatient ? highestValuePatient.name : "—"}
        sublabel={
          highestValuePatient ? (
            <Money value={highestValuePatient.value} currency={settings.currency} />
          ) : (
            "No patients confirmed this month"
          )
        }
        icon={<TrophyIcon className="h-4 w-4" />}
      />
    ),
  };

  const cardById = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const visibleCards = settings.dashboard_cards
    .map((id) => cardById.get(id))
    .filter((c): c is (typeof DASHBOARD_CARDS)[number] => c != null);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <span className="flex items-center gap-1.5" title="Live data">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-600">Live</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Your commission and the team&apos;s day-to-day, in one place.</p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Your earnings</h2>
          <p className="text-xs text-slate-500">Private to you — commission, rates and totals no one else on the team sees.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visibleCards.map((card) => (
            <div key={card.id}>{cardsById[card.id]}</div>
          ))}
        </div>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Earnings by month</h2>
            <span className="text-xs text-slate-400">Last 12 months</span>
          </div>
          <PrivateEarningsChart data={chartData} currency={settings.currency} />
          <p className="mt-3 text-xs text-slate-400">
            Updated <RelativeTime timestamp={updatedAt} />
          </p>
        </Card>
      </div>

      <hr className="border-slate-200" />

      <TeamOperationsPanel
        allPatients={allPatients}
        profiles={profiles}
        currentUserId={user?.id ?? ""}
        currency={settings.currency}
        todayIso={todayIso}
        monthAheadIso={monthAheadIso}
      />
    </div>
  );
}
