import { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { addMonths, currentMonthKey } from "@/lib/commission";
import { StatCard } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { OPERATIONAL_CARD_IDS, DASHBOARD_CARDS, DashboardCardId } from "@/lib/dashboard-cards";
import { TeamOperationsPanel } from "./TeamOperationsPanel";
import { CheckCircleIcon, PeopleIcon, UserPlusIcon } from "@/components/StatIcons";
import { getViewerUser } from "@/lib/viewer";

export default async function DashboardPage() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [allPatients, settings, profiles] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
  ]);
  // The stat cards above and the operational panel below are both scoped per-seller where it
  // matters: the panel's shared roster reveals no commission (that lives on /earnings) — those
  // numbers are already visible to everyone on /patients — so it can show the whole team via
  // its own Mine/Whole-team toggle without leaking anyone's pay.
  const patients = allPatients.filter((p) => p.responsible_seller_id === user?.id);

  const thisMonth = currentMonthKey();
  const patientsThisMonth = patients.filter(
    (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === thisMonth
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthAhead = new Date(today);
  monthAhead.setMonth(monthAhead.getMonth() + 1);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const monthAheadIso = `${monthAhead.getFullYear()}-${String(monthAhead.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(monthAhead.getDate()).padStart(2, "0")}`;

  const lastMonth = addMonths(thisMonth, -1);
  const patientsLastMonth = patients.filter(
    (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === lastMonth
  ).length;
  const newPatientsDelta = patientsThisMonth - patientsLastMonth;
  const totalPatients = patients.length;

  const cardsById: Record<DashboardCardId, ReactNode> = {
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
        label="Patients sold this month"
        value={<CountUp value={patientsThisMonth} />}
        sublabel={`vs ${patientsLastMonth} last month`}
        icon={<CheckCircleIcon className="h-4 w-4" />}
      />
    ),
    new_patients_delta: (
      <StatCard
        label="New patients vs last month"
        value={<CountUp value={newPatientsDelta} signed />}
        sublabel={`${patientsThisMonth} this month, ${patientsLastMonth} last month`}
        icon={<UserPlusIcon className="h-4 w-4" />}
      />
    ),
    // Money cards live on Earnings, not here — never reached, kept for the shared type.
    total_earned: null,
    total_commission: null,
    month_earnings: null,
    expected_earnings: null,
    upcoming_visits_value: null,
    avg_commission_patient: null,
    avg_treatment_value: null,
    highest_value_patient: null,
  };

  const cardById = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const visibleCards = settings.dashboard_cards
    .filter((id) => OPERATIONAL_CARD_IDS.includes(id))
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
        <p className="mt-1 text-sm text-slate-500">Today&apos;s visits, follow-ups and logistics for the whole team.</p>
      </div>

      {visibleCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visibleCards.map((card) => (
            <div key={card.id}>{cardsById[card.id]}</div>
          ))}
        </div>
      )}

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
