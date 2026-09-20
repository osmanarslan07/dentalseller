import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { computeMonthlyAggregates, countPatientsWithCompletedVisitInMonth, currentMonthKey } from "@/lib/commission";
import { Profile } from "@/types";
import { TeamPerformanceClient } from "./TeamPerformanceClient";

interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

function describeActivity(
  entry: ActivityLogRow,
  nameById: Map<string, string>,
  patientNameById: Map<string, string>
): string {
  const actor = (entry.actor_id && nameById.get(entry.actor_id)) || "Someone";
  const target = (entry.target_id && nameById.get(entry.target_id)) || "a seller";

  switch (entry.action) {
    case "seller_added":
      return `${actor} added seller (${entry.detail ?? "unknown email"})`;
    case "seller_activated":
      return `${actor} reactivated ${target}`;
    case "seller_deactivated":
      return `${actor} deactivated ${target}`;
    case "seller_promoted":
      return `${actor} promoted ${target} to admin`;
    case "seller_demoted":
      return `${actor} demoted ${target} to seller`;
    case "password_reset":
      return `${actor} reset ${target}'s password`;
    case "patient_reassigned": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      const newSeller = (entry.detail && nameById.get(entry.detail)) || "another seller";
      return `${actor} reassigned ${patientName} to ${newSeller}`;
    }
    case "patient_created": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || entry.detail || "a patient";
      return `${actor} added patient ${patientName}`;
    }
    case "patient_updated": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} edited ${patientName}${entry.detail ? ` — ${entry.detail}` : ""}`;
    }
    case "patient_deleted":
      return `${actor} deleted patient ${entry.detail || "(unnamed)"}`;
    case "visit_added": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} added a visit for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "visit_updated": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} edited a visit for ${patientName}${entry.detail ? ` — ${entry.detail}` : ""}`;
    }
    case "visit_deleted": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} deleted a visit for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "patient_logistics_toggled": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} marked ${patientName}'s ${entry.detail ?? "logistics"}`;
    }
    case "visit_logistics_toggled": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} marked a visit's ${entry.detail ?? "logistics"} for ${patientName}`;
    }
    case "patient_telegram_sent": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} sent a Telegram message for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "quote_created":
      return `${actor} created quote${entry.detail ? ` "${entry.detail}"` : ""}`;
    case "quote_updated":
      return `${actor} edited a quote${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "quote_duplicated":
      return `${actor} duplicated quote${entry.detail ? ` "${entry.detail}"` : ""}`;
    case "quote_deleted":
      return `${actor} deleted quote ${entry.detail || "(unnamed)"}`;
    case "quote_converted":
      return `${actor} converted a quote into a patient`;
    case "commission_settings_updated":
      return `${actor} changed commission settings${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "clinic_branding_updated":
      return `${actor} updated clinic branding${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "dashboard_cards_updated":
      return `${actor} changed their dashboard cards`;
    case "task_created":
      return `${actor} created task${entry.detail ? ` "${entry.detail}"` : ""}`;
    case "task_updated":
      return `${actor} edited task${entry.detail ? ` "${entry.detail}"` : ""}`;
    case "task_status_changed":
      return `${actor} marked a task ${entry.detail ?? "updated"}`;
    case "task_deleted":
      return `${actor} deleted task ${entry.detail || "(unnamed)"}`;
    case "display_name_updated":
      return `${actor} changed their display name${entry.detail ? ` (${entry.detail})` : ""}`;
    case "password_changed":
      return `${actor} changed their password`;
    case "telegram_link_generated":
      return `${actor} generated a Telegram link code`;
    default:
      return `${actor} — ${entry.action}`;
  }
}

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
