import { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

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

/** Compact human-readable diff of the given fields on a shared record, so any edit is
 * attributed to whoever made it — money, dates, status, or a logistics checkbox. `before`
 * and `after` are different shapes (a DB row vs. a form-parsed input) that merely share
 * these field names, hence the two independent type parameters. */
export function diffFields<B, A>(before: B, after: A, fields: { key: keyof B & keyof A; label: string }[]): string {
  const changes: string[] = [];
  for (const { key, label } of fields) {
    const b = (before as Record<string, unknown>)[key as string] ?? null;
    const a = (after as Record<string, unknown>)[key as string] ?? null;
    if (b === a) continue;
    const fmt = (v: unknown) => (typeof v === "boolean" ? (v ? "yes" : "no") : v ?? "—");
    changes.push(`${label} ${fmt(b)} → ${fmt(a)}`);
  }
  return changes.join(", ");
}

/** Exact, unambiguous timestamp for an audit entry — "14:30 17.09.2026" in the viewer's
 * local time. An audit trail exists so a change can be pinned down later; a decaying
 * "3 days ago" label defeats that once the entry is more than a few hours old. */
export function formatActivityTime(iso: string): string {
  return format(new Date(iso), "HH:mm dd.MM.yyyy");
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
    case "terms_accepted":
      return `${actor} accepted the terms of service ${entry.detail ?? ""}`.trim();
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
    case "seller_deleted":
      return `${actor} deleted seller (${entry.detail ?? "unknown email"})`;
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
      return `${actor} edited a task${entry.detail ? ` — ${entry.detail}` : ""}`;
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
    case "telegram_group_chat_updated":
      return `${actor} changed the shared Telegram group chat${entry.detail ? ` — ${entry.detail}` : ""}`;
    default:
      return `${actor} — ${entry.action}`;
  }
}
