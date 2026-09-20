import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { computeMonthlyAggregates, countPatientsWithCompletedVisitInMonth, currentMonthKey } from "@/lib/commission";
import { describeActivity } from "@/lib/activity-log";
import { Profile } from "@/types";
import { TeamPerformanceClient } from "./TeamPerformanceClient";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profiles = await getProfiles(supabase);
  const me = profiles.find((p) => p.id === user?.id);
  if (me?.role !== "admin") redirect("/");

  const allPatients = await getPatients(supabase);
  const thisMonth = currentMonthKey();

  const rows = await Promise.all(
    profiles.map(async (seller) => {
      // Pipeline counts (patient count, sold-this-month) follow current ownership; money and
      // "came this month" follow visit-level attribution so reassigning a patient away doesn't
      // erase a seller's already-earned commission from their own breakdown here.
      const sellerPatients = allPatients.filter((p) => p.responsible_seller_id === seller.id);
      const settings = await getSettings(supabase, seller.id);
      const aggregates = computeMonthlyAggregates(allPatients, settings, seller.id);
      const thisMonthAgg = aggregates.find((a) => a.month === thisMonth);

      const patientsSoldThisMonth = sellerPatients.filter(
        (p) => p.confirmation_date && p.confirmation_date.slice(0, 7) === thisMonth
      ).length;

      return {
        seller,
        currency: settings.currency,
        patientCount: sellerPatients.length,
        patientsSoldThisMonth,
        patientsCameThisMonth: countPatientsWithCompletedVisitInMonth(allPatients, thisMonth, seller.id),
        paidThisMonth: thisMonthAgg?.actualTotal ?? 0,
        thisMonthActual: thisMonthAgg?.actualCommission ?? 0,
        totalActual: aggregates.reduce((sum, a) => sum + a.actualCommission, 0),
        totalExpected: aggregates.reduce((sum, a) => sum + a.expectedCommission, 0),
      };
    })
  );

  const { data: logData } = await supabase
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at")
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

  return <TeamPerformanceClient rows={rows} activity={activity} />;
}
