import { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getSettings } from "@/lib/data";
import { dealToMain, dealToMainOrNull } from "@/lib/money";
import {
  addMonths,
  computeMonthlyAggregates,
  computeUnscheduledExpectedTotal,
  currentMonthKey,
  lastNMonths,
  monthLabel,
  treatmentTotal,
  visitExpectedTotal,
} from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import { Badge, Card, StatCard } from "@/components/ui";
import { CloseoutSummary } from "./CloseoutSummary";
import { closeoutStats } from "./closeout";
import { Money, Percent, PrivateEarningsChart } from "@/components/privacy";
import { RelativeTime } from "@/components/RelativeTime";
import { EARNINGS_CARD_IDS, DASHBOARD_CARDS, DashboardCardId } from "@/lib/dashboard-cards";
import { CommissionSettings } from "@/types";
import {
  WalletIcon,
  LayersIcon,
  TrendingUpIcon,
  HourglassIcon,
  PlaneIcon,
  PercentIcon,
  TagIcon,
  TrophyIcon,
} from "@/components/StatIcons";
import { getViewerUser } from "@/lib/viewer";
import { requirePagePermission } from "@/lib/permissions";
import { getLang, getT } from "@/i18n/server";
import { localeOf } from "@/i18n";
import { rich } from "@/i18n/rich";

function tierTone(total: number, settings: CommissionSettings): "slate" | "amber" | "green" {
  if (total <= settings.tier1_threshold) return "slate";
  if (total <= settings.tier2_threshold) return "amber";
  return "green";
}

export default async function EarningsPage() {
  await requirePagePermission("earnings.own");
  const updatedAt = Date.now();
  const t = await getT();
  const locale = localeOf(await getLang());
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  // every patient whose visits can earn this seller commission — exactly what the maths below reads
  const [allPatients, settings, clinicConfig] = await Promise.all([
    user ? getPatients(supabase, { creditedTo: user.id }) : Promise.resolve([]),
    getSettings(supabase, user?.id ?? ""),
    getClinicConfig(supabase),
  ]);
  // everything on this page is in the clinic's main currency
  const currency = clinicConfig.mainCurrency;
  // Earnings mirrors the old Dashboard money section: each seller's own commission only,
  // never a colleague's. Computed from ALL patients (not a pre-filtered list) so a seller
  // keeps credit for commission already earned on a patient that's since been reassigned
  // away — reassignment only affects who owns still-unpaid visits going forward.
  const patients = allPatients.filter((p) => p.responsible_seller_id === user?.id);
  const aggregates = computeMonthlyAggregates(allPatients, settings, user?.id ?? "");
  const aggregateMap = new Map(aggregates.map((a) => [a.month, a]));

  const totalActualCommission = aggregates.reduce((sum, a) => sum + a.actualCommission, 0);
  const thisMonth = currentMonthKey();
  const thisMonthAgg = aggregateMap.get(thisMonth);

  const totalPatients = patients.length;

  const chartMonths = lastNMonths(12);
  const chartData = chartMonths.map((m) => {
    const a = aggregateMap.get(m);
    return {
      label: monthLabel(m, locale),
      actual: a?.actualCommission ?? 0,
      expected: a?.expectedCommission ?? 0,
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthAhead = new Date(today);
  monthAhead.setMonth(monthAhead.getMonth() + 1);

  type UpcomingVisit = {
    expected: number | null;
  };

  const upcoming: UpcomingVisit[] = [];
  for (const p of patients) {
    const visitEntries: readonly (readonly [string | null, "upcoming" | "completed", number | null])[] = [
      [p.visit1_date, p.visit1_status, dealToMainOrNull(p, visitExpectedTotal(p, "visit1", p.visit1_expected))],
      [p.visit2_date, p.visit2_status, dealToMainOrNull(p, visitExpectedTotal(p, "visit2", p.visit2_expected))],
      ...p.extra_visits.map((v) => [v.visit_date, v.status, dealToMainOrNull(p, visitExpectedTotal(p, v.id, v.expected))] as const),
    ];
    for (const [date, status, expected] of visitEntries) {
      if (!date || status !== "upcoming") continue;
      const d = new Date(date);
      if (d >= today && d <= monthAhead) upcoming.push({ expected });
    }
  }

  // Visits with no date yet (e.g. visit2 not booked) are excluded from the per-month
  // aggregates/chart so they don't skew a specific month's bar — add them back in here,
  // valued at the current month's rate, so totals still reflect all confirmed work.
  const unscheduledExpectedTotal = computeUnscheduledExpectedTotal(allPatients, user?.id ?? "");
  const unscheduledExpectedCommission = unscheduledExpectedTotal * (thisMonthAgg?.expectedRate ?? 0);

  const totalExpectedCommission =
    aggregates.reduce((sum, a) => sum + a.expectedCommission, 0) + unscheduledExpectedCommission;
  const outstandingExpected = totalExpectedCommission - totalActualCommission;

  const upcomingValue = upcoming.reduce((sum, v) => sum + (v.expected ?? 0), 0);

  const avgCommissionPerPatient = totalPatients > 0 ? totalActualCommission / totalPatients : 0;
  const avgTreatmentValue =
    totalPatients > 0 ? patients.reduce((sum, p) => sum + dealToMain(p, treatmentTotal(p)), 0) / totalPatients : 0;

  const highestValuePatient = patients
    .filter((p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === thisMonth)
    .reduce<{ name: string; value: number } | null>((best, p) => {
      const value = dealToMain(p, treatmentTotal(p));
      return !best || value > best.value ? { name: p.name, value } : best;
    }, null);

  const cardsById: Record<DashboardCardId, ReactNode> = {
    total_earned: (
      <StatCard
        label={t("Total earned to date")}
        value={<Money value={totalActualCommission} currency={currency} animate />}
        sublabel={t("Confirmed commission, actual payments")}
        icon={<WalletIcon className="h-4 w-4" />}
      />
    ),
    total_commission: (
      <StatCard
        label={t("Total commission (earned + expected)")}
        value={<Money value={totalActualCommission + totalExpectedCommission} currency={currency} animate />}
        sublabel={rich(t("{earned} earned + {expected} expected"), {
          earned: <Money value={totalActualCommission} currency={currency} showConversion={false} />,
          expected: <Money value={totalExpectedCommission} currency={currency} showConversion={false} />,
        })}
        icon={<LayersIcon className="h-4 w-4" />}
      />
    ),
    month_earnings: (
      <StatCard
        label={t("This month's earnings so far")}
        value={<Money value={thisMonthAgg?.actualCommission ?? 0} currency={currency} animate />}
        sublabel={t("From {amount} received", { amount: formatCurrency(thisMonthAgg?.actualTotal ?? 0, currency) })}
        icon={<TrendingUpIcon className="h-4 w-4" />}
      />
    ),
    expected_earnings: (
      <StatCard
        label={t("Total expected earnings")}
        value={<Money value={outstandingExpected} currency={currency} animate />}
        sublabel={t("Remaining commission across confirmed treatment plans")}
        icon={<HourglassIcon className="h-4 w-4" />}
      />
    ),
    upcoming_visits_value: (
      <StatCard
        label={t("Upcoming visits value (30 days)")}
        value={<Money value={upcomingValue} currency={currency} animate />}
        sublabel={upcoming.length === 1 ? t("1 visit scheduled") : t("{n} visits scheduled", { n: upcoming.length })}
        icon={<PlaneIcon className="h-4 w-4" />}
      />
    ),
    avg_commission_patient: (
      <StatCard
        label={t("Average commission per patient")}
        value={<Money value={avgCommissionPerPatient} currency={currency} animate />}
        sublabel={t("Across {n} patients", { n: totalPatients })}
        icon={<PercentIcon className="h-4 w-4" />}
      />
    ),
    avg_treatment_value: (
      <StatCard
        label={t("Average treatment value per patient")}
        value={<Money value={avgTreatmentValue} currency={currency} animate />}
        sublabel={t("Visit 1 + visit 2 expected total")}
        icon={<TagIcon className="h-4 w-4" />}
      />
    ),
    highest_value_patient: (
      <StatCard
        label={t("Highest-value patient this month")}
        value={highestValuePatient ? highestValuePatient.name : "—"}
        sublabel={
          highestValuePatient ? (
            <Money value={highestValuePatient.value} currency={currency} />
          ) : (
            t("No patients confirmed this month")
          )
        }
        icon={<TrophyIcon className="h-4 w-4" />}
      />
    ),
    // Operational cards live on Dashboard, not here — never reached, kept for the shared type.
    patients_sold: null,
    confirmed_this_month: null,
    new_patients_delta: null,
  };

  const cardById = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const visibleCards = settings.dashboard_cards
    .filter((id) => EARNINGS_CARD_IDS.includes(id))
    .map((id) => cardById.get(id))
    .filter((c): c is (typeof DASHBOARD_CARDS)[number] => c != null);

  const months = aggregates.map((a) => a.month);
  let minMonth = months.length ? months.reduce((a, b) => (a < b ? a : b)) : thisMonth;
  let maxMonth = months.length ? months.reduce((a, b) => (a > b ? a : b)) : thisMonth;
  if (thisMonth < minMonth) minMonth = thisMonth;
  if (thisMonth > maxMonth) maxMonth = thisMonth;

  const fullRange: string[] = [];
  for (let m = minMonth; m <= maxMonth; m = addMonths(m, 1)) fullRange.push(m);

  const rows = fullRange.map((m) => {
    const a = aggregateMap.get(m);
    return (
      a ?? {
        month: m,
        actualTotal: 0,
        expectedTotal: 0,
        actualRate: settings.tier1_rate,
        expectedRate: settings.tier1_rate,
        actualCommission: settings.fixed_monthly_payment,
        expectedCommission: settings.fixed_monthly_payment,
        patientCount: 0,
      }
    );
  });

  rows.reverse();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{t("Earnings")}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {t("Private to you")}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {rich(t("Commission is {r1} up to {t1}, {r2} up to {t2}, then {r3} above. Plus {fixed} fixed per month."), {
            r1: <Percent value={settings.tier1_rate} />,
            t1: <Money value={settings.tier1_threshold} currency={currency} showConversion={false} />,
            r2: <Percent value={settings.tier2_rate} />,
            t2: <Money value={settings.tier2_threshold} currency={currency} showConversion={false} />,
            r3: <Percent value={settings.tier3_rate} />,
            fixed: <Money value={settings.fixed_monthly_payment} currency={currency} showConversion={false} />,
          })}
        </p>
      </div>

      {visibleCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visibleCards.map((card) => (
            <div key={card.id}>{cardsById[card.id]}</div>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t("Earnings by month")}</h2>
          <span className="text-xs text-slate-400">{t("Last 12 months")}</span>
        </div>
        <PrivateEarningsChart data={chartData} currency={currency} />
        <p className="mt-3 text-xs text-slate-400">
          {rich(t("Updated {when}"), { when: <RelativeTime timestamp={updatedAt} /> })}
        </p>
      </Card>

      <CloseoutSummary
        statsByMonth={closeoutStats(allPatients, user?.id ?? "", settings, fullRange)}
        months={[...fullRange].reverse()}
        defaultMonth={thisMonth}
      />

      <div className="grid gap-3 md:hidden">
        {rows.map((r) => {
          const isCurrent = r.month === thisMonth;
          return (
            <Card key={r.month} className={`p-4 ${isCurrent ? "bg-teal-50/50" : ""}`}>
              <div className="flex items-center gap-2 font-medium text-slate-800">
                {monthLabel(r.month, locale)}
                {isCurrent && <Badge tone="blue">{t("Current")}</Badge>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{t("Actual received")}</div>
                  <div className="text-slate-600">{formatCurrency(r.actualTotal, currency)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{t("Actual commission")}</div>
                  <div className="font-medium text-slate-800">
                    <Money value={r.actualCommission} currency={currency} />
                  </div>
                  <Badge tone={tierTone(r.actualTotal, settings)}>
                    <Percent value={r.actualRate} />
                  </Badge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{t("Expected (scheduled)")}</div>
                  <div className="text-slate-600">{formatCurrency(r.expectedTotal, currency)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{t("Expected commission")}</div>
                  <div className="font-medium text-slate-800">
                    <Money value={r.expectedCommission} currency={currency} />
                  </div>
                  <Badge tone={tierTone(r.expectedTotal, settings)}>
                    <Percent value={r.expectedRate} />
                  </Badge>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 pr-4 font-medium">{t("Month")}</th>
                <th className="py-3 pr-4 font-medium">{t("Actual received")}</th>
                <th className="py-3 pr-4 font-medium">{t("Actual tier")}</th>
                <th className="py-3 pr-4 font-medium">{t("Actual commission")}</th>
                <th className="py-3 pr-4 font-medium">{t("Expected (scheduled)")}</th>
                <th className="py-3 pr-4 font-medium">{t("Expected tier")}</th>
                <th className="py-3 pr-4 font-medium">{t("Expected commission")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isCurrent = r.month === thisMonth;
                return (
                  <tr
                    key={r.month}
                    className={`border-b border-slate-50 last:border-0 ${
                      isCurrent ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <td className="py-3 pl-4 pr-4 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {monthLabel(r.month, locale)}
                        {isCurrent && <Badge tone="blue">{t("Current")}</Badge>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatCurrency(r.actualTotal, currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={tierTone(r.actualTotal, settings)}>
                        <Percent value={r.actualRate} />
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      <Money value={r.actualCommission} currency={currency} />
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatCurrency(r.expectedTotal, currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={tierTone(r.expectedTotal, settings)}>
                        <Percent value={r.expectedRate} />
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      <Money value={r.expectedCommission} currency={currency} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
