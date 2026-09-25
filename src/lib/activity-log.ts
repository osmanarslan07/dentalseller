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
  /** Done by DentalSeller support (a superadmin in support mode) — set by the database. */
  via_support?: boolean;
  /** The account that did it, kept when that account was deleted (actor_id is then null). */
  former_actor_id?: string | null;
}

/** Who did it, as the history shows it. A deleted account keeps its id (former_actor_id) and,
 * through its surviving seller record, usually its name. */
export function activityActorName(entry: ActivityLogRow, nameById: Map<string, string>): string {
  if (entry.via_support) return "DentalSeller support";
  if (entry.actor_id) return nameById.get(entry.actor_id) || "Someone";
  if (entry.former_actor_id) {
    const ref = `deleted user #${entry.former_actor_id.slice(0, 6)}`;
    const name = nameById.get(entry.former_actor_id);
    return name ? `${name} (${ref})` : ref.charAt(0).toUpperCase() + ref.slice(1);
  }
  return "Someone";
}

/** Shared between the team page's full activity feed and a single patient's History tab —
 * `nameById` resolves actor/reassignment-target sellers, `patientNameById` resolves patient
 * targets. Both can be as small as a single entry when the caller already knows the subject. */
export function describeActivity(
  entry: ActivityLogRow,
  nameById: Map<string, string>,
  patientNameById: Map<string, string>
): string {
  const actor = activityActorName(entry, nameById);
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
    case "telegram_linked":
      return `${actor} connected their Telegram`;
    case "member_roles_changed":
      return `${actor} changed ${target}'s roles${entry.detail ? ` (${entry.detail})` : ""}`;
    case "seller_deleted":
      return `${actor} deleted seller (${entry.detail ?? "unknown email"})`;
    case "role_created":
      return `${actor} created the role ${entry.detail ?? ""}`.trim();
    case "role_changed":
      return `${actor} changed the role ${entry.detail ?? ""}`.trim();
    case "role_reset":
      return `${actor} reset the role ${entry.detail ?? ""}`.trim();
    case "role_deleted":
      return `${actor} deleted the role ${entry.detail ?? ""}`.trim();
    case "password_reset":
      return `${actor} reset ${target}'s password`;
    case "seller_record_added":
      return `${actor} added seller ${entry.detail ?? ""} (no account)`.trim();
    case "seller_record_renamed":
      return `${actor} renamed seller ${entry.detail ?? ""}`.trim();
    case "seller_record_activated":
      return `${actor} reactivated seller ${target}`;
    case "seller_record_deactivated":
      return `${actor} deactivated seller ${target}`;
    case "seller_record_deleted":
      return `${actor} removed seller ${entry.detail ?? ""}`.trim();
    case "seller_record_merged":
      return `${actor} merged seller ${entry.detail ?? ""}`.trim();
    case "seller_commission_updated":
      return `${actor} changed ${target}'s commission rates`;
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
    case "payment_added": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} recorded a payment for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "payment_updated": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} edited a payment for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "payment_deleted": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} deleted a payment for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "file_uploaded": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} uploaded ${entry.detail ?? "a file"} to ${patientName}`;
    }
    case "file_renamed": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} renamed a file of ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "file_deleted": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} deleted ${entry.detail ?? "a file"} from ${patientName}`;
    }
    case "discount_set": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} gave ${patientName} a discount${entry.detail ? ` — ${entry.detail}` : ""}`;
    }
    case "discount_removed": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} removed a discount for ${patientName}${entry.detail ? ` — ${entry.detail}` : ""}`;
    }
    case "extra_added": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} added an extra for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "extra_updated": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} edited an extra for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "extra_deleted": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} deleted an extra for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "transfer_added": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} added a transfer for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "transfer_updated": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} edited a transfer for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "transfer_deleted": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} deleted a transfer for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
    case "transfer_sent": {
      const patientName = (entry.target_id && patientNameById.get(entry.target_id)) || "a patient";
      return `${actor} sent a transfer to the driver for ${patientName}${entry.detail ? ` (${entry.detail})` : ""}`;
    }
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
    case "transfer_company_added":
      return `${actor} added transfer company${entry.detail ? ` ${entry.detail}` : ""}`;
    case "transfer_company_updated":
      return `${actor} updated transfer company${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "transfer_company_deleted":
      return `${actor} deleted transfer company${entry.detail ? ` ${entry.detail}` : ""}`;
    case "driver_messages_updated":
      return `${actor} changed how drivers get transfer messages${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "transfer_defaults_updated":
      return `${actor} changed the default transfer company/driver`;
    case "driver_added":
      return `${actor} added driver${entry.detail ? ` ${entry.detail}` : ""}`;
    case "driver_updated":
      return `${actor} updated driver${entry.detail ? ` — ${entry.detail}` : ""}`;
    case "driver_deleted":
      return `${actor} deleted driver${entry.detail ? ` ${entry.detail}` : ""}`;
    case "system_settings_updated":
      return `${actor} changed system settings${entry.detail ? ` — ${entry.detail}` : ""}`;
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
    case "phone_updated":
      return `${actor} changed their phone${entry.detail ? ` (${entry.detail})` : ""}`;
    case "email_changed":
      return `${actor} changed their sign-in email${entry.detail ? ` (${entry.detail})` : ""}`;
    case "avatar_updated":
      return `${actor} changed their photo`;
    case "avatar_removed":
      return `${actor} removed their photo`;
    case "coordinator_handover":
      return `${actor} handed ${target}'s coordinated patients over${entry.detail ? ` (${entry.detail})` : ""}`;
    case "member_profile_updated":
      return `${actor} changed ${target}'s details${entry.detail ? ` (${entry.detail})` : ""}`;
    case "telegram_link_generated":
      return `${actor} generated a Telegram link code`;
    case "telegram_group_chat_updated":
      return `${actor} changed the shared Telegram group chat${entry.detail ? ` — ${entry.detail}` : ""}`;
    default:
      return `${actor} — ${entry.action}`;
  }
}
