import { SupabaseClient } from "@supabase/supabase-js";

/** Best-effort audit log — a logging failure should never break the action it's recording. */
export async function logActivity(
  supabase: SupabaseClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: string
): Promise<void> {
  try {
    await supabase
      .from("activity_log")
      .insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, detail });
  } catch (err) {
    console.error("Activity log write failed:", err);
  }
}

export interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

/** Shared between the team page's full activity feed and a single patient's History tab —
 * `nameById` resolves actor/reassignment-target sellers, `patientNameById` resolves patient
 * targets. Both can be as small as a single entry when the caller already knows the subject. */
export function describeActivity(
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
