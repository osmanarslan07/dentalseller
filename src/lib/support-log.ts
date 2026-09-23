import { createAdminClient } from "@/lib/supabase/admin";

export type SupportLogEvent =
  | "session_started"
  | "session_ended"
  | "session_extended"
  | "editing_unlocked"
  | "editing_locked"
  | "view_as_changed"
  | "page_viewed"
  | "record_history_viewed";

/** Appends to the tamper-evident support access log (hash-chained in the database). Never
 * patient data: paths, staff names and record references only. Best-effort — the support
 * action itself shouldn't fail because the log write did, but a failure is loud in the
 * server logs. ("change_made" events are written by a database trigger, not from here.) */
export async function recordSupportEvent(entry: {
  sessionId: string | null;
  superadminId: string;
  clinicId: string | null;
  event: SupportLogEvent;
  path?: string;
  detail?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("support_access_log").insert({
      session_id: entry.sessionId,
      superadmin_id: entry.superadminId,
      clinic_id: entry.clinicId,
      event: entry.event,
      path: entry.path ?? null,
      detail: entry.detail ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error(`SUPPORT LOG WRITE FAILED (${entry.event}):`, err);
  }
}
