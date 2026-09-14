import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { computeMonthlyAggregates, currentMonthKey } from "@/lib/commission";
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
      const sellerPatients = allPatients.filter((p) => p.responsible_seller_id === seller.id);
      const settings = await getSettings(supabase, seller.id);
      const aggregates = computeMonthlyAggregates(sellerPatients, settings);
      const thisMonthAgg = aggregates.find((a) => a.month === thisMonth);

      return {
        seller,
        currency: settings.currency,
        patientCount: sellerPatients.length,
        thisMonthActual: thisMonthAgg?.actualCommission ?? 0,
        totalActual: aggregates.reduce((sum, a) => sum + a.actualCommission, 0),
        totalExpected: aggregates.reduce((sum, a) => sum + a.expectedCommission, 0),
      };
    })
  );

  return <TeamPerformanceClient rows={rows} />;
}
