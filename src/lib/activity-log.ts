import { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { makeT, msg, T } from "@/i18n";

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
  return format(new Date(iso), "HH:mm dd/MM/yyyy");
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
export function activityActorName(entry: ActivityLogRow, nameById: Map<string, string>, t: T = EN): string {
  if (entry.via_support) return t("DentalSeller support");
  if (entry.actor_id) return nameById.get(entry.actor_id) || t("Someone");
  if (entry.former_actor_id) {
    const ref = t("deleted user #{id}", { id: entry.former_actor_id.slice(0, 6) });
    const name = nameById.get(entry.former_actor_id);
    return name ? `${name} (${ref})` : ref.charAt(0).toUpperCase() + ref.slice(1);
  }
  return t("Someone");
}

const EN = makeT("en");

/** English sentence template per action (translated through `t`). Every one starts with
 * {actor} — the patient History tab strips that prefix. {patient} is the patient's name,
 * {target} a member/seller. The stored detail stays as written: `tail` appends it as
 * " — detail" or " (detail)" when there is one. */
const TEMPLATES: Record<string, { text: string; tail?: "dash" | "paren" }> = {
  terms_accepted: { text: msg("{actor} accepted the terms of service"), tail: "paren" },
  seller_added: { text: msg("{actor} added seller"), tail: "paren" },
  seller_activated: { text: msg("{actor} reactivated {target}") },
  seller_deactivated: { text: msg("{actor} deactivated {target}") },
  seller_promoted: { text: msg("{actor} promoted {target} to admin") },
  seller_demoted: { text: msg("{actor} demoted {target} to seller") },
  telegram_linked: { text: msg("{actor} connected their Telegram") },
  member_roles_changed: { text: msg("{actor} changed {target}'s roles"), tail: "paren" },
  seller_deleted: { text: msg("{actor} deleted seller"), tail: "paren" },
  role_created: { text: msg("{actor} created a role"), tail: "paren" },
  role_changed: { text: msg("{actor} changed a role"), tail: "paren" },
  role_reset: { text: msg("{actor} reset a role"), tail: "paren" },
  role_deleted: { text: msg("{actor} deleted a role"), tail: "paren" },
  password_reset: { text: msg("{actor} reset {target}'s password") },
  seller_record_added: { text: msg("{actor} added a seller without an account"), tail: "paren" },
  seller_record_renamed: { text: msg("{actor} renamed a seller"), tail: "paren" },
  seller_record_activated: { text: msg("{actor} reactivated seller {target}") },
  seller_record_deactivated: { text: msg("{actor} deactivated seller {target}") },
  seller_record_deleted: { text: msg("{actor} removed a seller"), tail: "paren" },
  seller_record_merged: { text: msg("{actor} merged sellers"), tail: "paren" },
  seller_commission_updated: { text: msg("{actor} changed {target}'s commission rates") },
  seller_currency_updated: { text: msg("{actor} set {target}'s usual currency"), tail: "paren" },
  deal_currency_updated: { text: msg("{actor} changed {patient}'s deal currency or rate"), tail: "dash" },
  patient_created: { text: msg("{actor} added patient {patient}") },
  patient_updated: { text: msg("{actor} edited {patient}"), tail: "dash" },
  patient_deleted: { text: msg("{actor} deleted a patient"), tail: "paren" },
  payment_added: { text: msg("{actor} recorded a payment for {patient}"), tail: "paren" },
  payment_updated: { text: msg("{actor} edited a payment for {patient}"), tail: "paren" },
  payment_deleted: { text: msg("{actor} deleted a payment for {patient}"), tail: "paren" },
  file_uploaded: { text: msg("{actor} uploaded a file to {patient}"), tail: "paren" },
  file_renamed: { text: msg("{actor} renamed a file of {patient}"), tail: "paren" },
  file_deleted: { text: msg("{actor} deleted a file from {patient}"), tail: "paren" },
  discount_set: { text: msg("{actor} gave {patient} a discount"), tail: "dash" },
  discount_removed: { text: msg("{actor} removed a discount for {patient}"), tail: "dash" },
  extra_added: { text: msg("{actor} added an extra for {patient}"), tail: "paren" },
  extra_updated: { text: msg("{actor} edited an extra for {patient}"), tail: "paren" },
  extra_deleted: { text: msg("{actor} deleted an extra for {patient}"), tail: "paren" },
  transfer_added: { text: msg("{actor} added a transfer for {patient}"), tail: "paren" },
  transfer_updated: { text: msg("{actor} edited a transfer for {patient}"), tail: "paren" },
  transfer_deleted: { text: msg("{actor} deleted a transfer for {patient}"), tail: "paren" },
  transfer_sent: { text: msg("{actor} sent a transfer to the driver for {patient}"), tail: "paren" },
  visit_added: { text: msg("{actor} added a visit for {patient}"), tail: "paren" },
  visit_updated: { text: msg("{actor} edited a visit for {patient}"), tail: "dash" },
  visit_deleted: { text: msg("{actor} deleted a visit for {patient}"), tail: "paren" },
  patient_logistics_toggled: { text: msg("{actor} updated {patient}'s logistics"), tail: "paren" },
  visit_logistics_toggled: { text: msg("{actor} updated a visit's logistics for {patient}"), tail: "paren" },
  patient_telegram_sent: { text: msg("{actor} sent a Telegram message for {patient}"), tail: "paren" },
  quote_created: { text: msg("{actor} created a quote"), tail: "paren" },
  quote_updated: { text: msg("{actor} edited a quote"), tail: "dash" },
  quote_duplicated: { text: msg("{actor} duplicated a quote"), tail: "paren" },
  quote_deleted: { text: msg("{actor} deleted a quote"), tail: "paren" },
  quote_converted: { text: msg("{actor} converted a quote into a patient") },
  commission_settings_updated: { text: msg("{actor} changed commission settings"), tail: "dash" },
  clinic_branding_updated: { text: msg("{actor} updated clinic branding"), tail: "dash" },
  transfer_company_added: { text: msg("{actor} added a transfer company"), tail: "paren" },
  transfer_company_updated: { text: msg("{actor} updated a transfer company"), tail: "dash" },
  transfer_company_deleted: { text: msg("{actor} deleted a transfer company"), tail: "paren" },
  driver_messages_updated: { text: msg("{actor} changed how drivers get transfer messages"), tail: "dash" },
  transfer_defaults_updated: { text: msg("{actor} changed the default transfer company/driver") },
  driver_added: { text: msg("{actor} added a driver"), tail: "paren" },
  driver_updated: { text: msg("{actor} updated a driver"), tail: "dash" },
  driver_deleted: { text: msg("{actor} deleted a driver"), tail: "paren" },
  system_settings_updated: { text: msg("{actor} changed system settings"), tail: "dash" },
  dashboard_cards_updated: { text: msg("{actor} changed their dashboard cards") },
  task_created: { text: msg("{actor} created a task"), tail: "paren" },
  task_updated: { text: msg("{actor} edited a task"), tail: "dash" },
  task_status_changed: { text: msg("{actor} changed a task's status"), tail: "paren" },
  task_deleted: { text: msg("{actor} deleted a task"), tail: "paren" },
  display_name_updated: { text: msg("{actor} changed their display name"), tail: "paren" },
  password_changed: { text: msg("{actor} changed their password") },
  phone_updated: { text: msg("{actor} changed their phone"), tail: "paren" },
  email_changed: { text: msg("{actor} changed their sign-in email"), tail: "paren" },
  avatar_updated: { text: msg("{actor} changed their photo") },
  avatar_removed: { text: msg("{actor} removed their photo") },
  coordinator_handover: { text: msg("{actor} handed {target}'s coordinated patients over"), tail: "paren" },
  member_profile_updated: { text: msg("{actor} changed {target}'s details"), tail: "paren" },
  telegram_link_generated: { text: msg("{actor} generated a Telegram link code") },
  telegram_group_chat_updated: { text: msg("{actor} changed the shared Telegram group chat"), tail: "dash" },
};

/** Shared between the team page's full activity feed and a single patient's History tab —
 * `nameById` resolves actor/reassignment-target sellers, `patientNameById` resolves patient
 * targets. Both can be as small as a single entry when the caller already knows the subject.
 * `t` gives the sentence in the viewer's language; the stored detail stays as written. */
export function describeActivity(
  entry: ActivityLogRow,
  nameById: Map<string, string>,
  patientNameById: Map<string, string>,
  t: T = EN
): string {
  const actor = activityActorName(entry, nameById, t);
  const target = (entry.target_id && nameById.get(entry.target_id)) || t("a seller");
  const knownPatient = entry.target_id ? patientNameById.get(entry.target_id) : undefined;
  const patient = knownPatient || t("a patient");
  const d = entry.detail;

  if (entry.action === "patient_reassigned") {
    const seller = (d && nameById.get(d)) || t("another seller");
    return t("{actor} reassigned {patient} to {seller}", { actor, patient, seller });
  }
  // a patient added and since deleted: the detail holds the name
  if (entry.action === "patient_created" && !knownPatient && d) {
    return t("{actor} added patient {patient}", { actor, patient: d });
  }
  const tpl = TEMPLATES[entry.action];
  if (!tpl) return `${actor} — ${entry.action}`;
  const text = t(tpl.text, { actor, target, patient });
  if (!d || !tpl.tail) return text;
  return tpl.tail === "dash" ? `${text} — ${d}` : `${text} (${d})`;
}
