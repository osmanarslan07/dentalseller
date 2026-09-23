import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import {
  computeMonthlyAggregates,
  countPatientsWithCompletedVisitInMonth,
  currentMonthKey,
  lastNMonths,
  monthLabel,
} from "@/lib/commission";
import { describeActivity } from "@/lib/activity-log";
import { Profile } from "@/types";
import { TeamPerformanceClient } from "./TeamPerformanceClient";
import { getViewerUser } from "@/lib/viewer";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();

  const profiles = await getProfiles(supabase);
  const me = profiles.find((p) => p.id === user?.id);
  if (me?.role !== "admin") redirect("/");

  const { month: monthParam } = await searchParams;
  const selectedMonth = monthParam && MONTH_KEY_RE.test(monthParam) ? monthParam : currentMonthKey();

  const allPatients = await getPatients(supabase);

  const rows = await Promise.all(
    profiles.map(async (seller) => {
      // Pipeline counts (patient count, sold-in-month) follow current ownership; money and
      // "came in month" follow visit-level attribution so reassigning a patient away doesn't
      // erase a seller's already-earned commission from their own breakdown here.
      const sellerPatients = allPatients.filter((p) => p.responsible_seller_id === seller.id);
      const settings = await getSettings(supabase, seller.id);
      const aggregates = computeMonthlyAggregates(allPatients, settings, seller.id);
      const monthAgg = aggregates.find((a) => a.month === selectedMonth);

      const patientsSoldInMonth = sellerPatients.filter(
        (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === selectedMonth
      ).length;

      return {
        seller,
        currency: settings.currency,
        patientCount: sellerPatients.length,
        patientsSoldInMonth,
        patientsCameInMonth: countPatientsWithCompletedVisitInMonth(allPatients, selectedMonth, seller.id),
        paidInMonth: monthAgg?.actualTotal ?? 0,
        commissionInMonth: monthAgg?.actualCommission ?? 0,
      };
    })
  );

  const { data: logData } = await supabase
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at, via_support")
    .order("created_at", { ascending: false })
    .limit(50);

  const nameById = new Map<string, string>(
    profiles.map((p: Profile) => [p.id, p.display_name || "Unnamed seller"])
  );
  const patientNameById = new Map(allPatients.map((p) => [p.id, p.name]));

  const activity = (logData ?? []).map((entry) => ({
    id: entry.id,
    createdAt: entry.created_at,
    description: describeActivity(entry, nameById, patientNameById),
  }));

  // The clinic's operations in this app start January 2026 — no point listing months
  // before any data could exist.
  const CLINIC_START_MONTH = "2026-01";
  const [startYear, startMonthNum] = CLINIC_START_MONTH.split("-").map(Number);
  const [currentYear, currentMonthNum] = currentMonthKey().split("-").map(Number);
  const monthsSinceStart = (currentYear - startYear) * 12 + (currentMonthNum - startMonthNum) + 1;
  const monthOptions = lastNMonths(Math.max(monthsSinceStart, 1))
    .reverse()
    .map((m) => ({ value: m, label: monthLabel(m) }));

  return (
    <TeamPerformanceClient
      rows={rows}
      activity={activity}
      selectedMonth={selectedMonth}
      selectedMonthLabel={monthLabel(selectedMonth)}
      monthOptions={monthOptions}
    />
  );
}
