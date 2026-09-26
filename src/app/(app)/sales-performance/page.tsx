import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatientCountsBySeller, getPatientTotals, getProfiles, getSellers, getSettings } from "@/lib/data";
import {
  addMonths,
  computeMonthlyAggregates,
  countPatientsWithCompletedVisitInMonth,
  currentMonthKey,
  lastNMonths,
  monthLabel,
} from "@/lib/commission";
import { SalesPerformanceClient } from "./SalesPerformanceClient";
import { requirePagePermission } from "@/lib/permissions";
import { getLang } from "@/i18n/server";
import { localeOf } from "@/i18n";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** Every seller's sales and commission by month (the old Team page, without its activity feed —
 * that has its own page under Activity). */
export default async function SalesPerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePagePermission("earnings.all");
  const locale = localeOf(await getLang());
  const supabase = await createClient();

  const { month: monthParam } = await searchParams;
  const selectedMonth = monthParam && MONTH_KEY_RE.test(monthParam) ? monthParam : currentMonthKey();

  // A month's totals only read visits dated in that month (computeMonthTotals), so patients
  // with a visit in it are all the commission maths needs; the counts come from the database.
  const month = { from: `${selectedMonth}-01`, to: `${addMonths(selectedMonth, 1)}-01` };
  const [monthPatients, sellers, clinicConfig, counts, profiles] = await Promise.all([
    getPatientTotals(supabase, { visitIn: month }),
    getSellers(supabase),
    getClinicConfig(supabase),
    // every seller's patient count and sold-in-month count, in one query
    getPatientCountsBySeller(supabase, month),
    getProfiles(supabase),
  ]);
  const roleById = new Map(profiles.map((p) => [p.id, p.role]));

  // Every seller, account or not — a seller without an account only once they have a patient
  // or are still on the list (a retired one with no history just adds noise).
  // (an account's record is active only while it has the Sales role, so a coordinator or
  // accountant without patients doesn't show up as a seller)
  const shown = sellers.filter((s) => s.is_active || counts.has(s.id));

  const rows = await Promise.all(
    shown.map(async (seller) => {
      // Pipeline counts (patient count, sold-in-month) follow current ownership; money and
      // "came in month" follow visit-level attribution so reassigning a patient away doesn't
      // erase a seller's already-earned commission from their own breakdown here.
      const settings = await getSettings(supabase, seller.id);
      const patientCount = counts.get(seller.id)?.total ?? 0;
      const patientsSoldInMonth = counts.get(seller.id)?.confirmed ?? 0;
      const aggregates = computeMonthlyAggregates(monthPatients, settings, seller.id);
      const monthAgg = aggregates.find((a) => a.month === selectedMonth);

      const role = roleById.get(seller.id);
      return {
        seller: {
          id: seller.id,
          name: seller.name,
          role: seller.profile_id ? (role === "admin" ? ("admin" as const) : ("seller" as const)) : null,
          isActive: seller.is_active,
        },
        // commission and tiers are in the clinic's main currency, whatever the deals were in
        currency: clinicConfig.mainCurrency,
        patientCount,
        patientsSoldInMonth,
        patientsCameInMonth: countPatientsWithCompletedVisitInMonth(monthPatients, selectedMonth, seller.id),
        paidInMonth: monthAgg?.actualTotal ?? 0,
        commissionInMonth: monthAgg?.actualCommission ?? 0,
      };
    })
  );


  // The clinic's operations in this app start January 2026 — no point listing months
  // before any data could exist.
  const CLINIC_START_MONTH = "2026-01";
  const [startYear, startMonthNum] = CLINIC_START_MONTH.split("-").map(Number);
  const [currentYear, currentMonthNum] = currentMonthKey().split("-").map(Number);
  const monthsSinceStart = (currentYear - startYear) * 12 + (currentMonthNum - startMonthNum) + 1;
  const monthOptions = lastNMonths(Math.max(monthsSinceStart, 1))
    .reverse()
    .map((m) => ({ value: m, label: monthLabel(m, locale) }));

  return (
    <SalesPerformanceClient
      rows={rows}
      selectedMonth={selectedMonth}
      selectedMonthLabel={monthLabel(selectedMonth, locale)}
      monthOptions={monthOptions}
    />
  );
}
