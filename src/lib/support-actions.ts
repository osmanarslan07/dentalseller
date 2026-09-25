"use server";

import { st } from "@/i18n/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSuperadmin } from "@/lib/platform";
import { recordSupportEvent } from "@/lib/support-log";

/** How long a support session stays open without being extended. */
const SESSION_MINUTES = 120;
/** How long "Unlock editing" lasts before the session drops back to view-only. */
const EDITING_MINUTES = 30;

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function getOpenSession(superadminId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_sessions")
    .select("id, clinic_id, expires_at")
    .eq("superadmin_id", superadminId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error(await st("No open support session"));
  return data;
}

/** Ends every open session of this superadmin, logging each. */
async function closeOpenSessions(superadminId: string): Promise<{ clinic_id: string } | null> {
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("support_sessions")
    .select("id, clinic_id")
    .eq("superadmin_id", superadminId)
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  if (!open?.length) return null;

  await admin
    .from("support_sessions")
    .update({ ended_at: new Date().toISOString(), editing_until: null })
    .in(
      "id",
      open.map((s) => s.id)
    );
  for (const s of open) {
    await recordSupportEvent({ sessionId: s.id, superadminId, clinicId: s.clinic_id, event: "session_ended" });
  }
  return open[0];
}

/** Opens a clinic in support mode — view-only, viewing as the clinic's first active admin
 * (so it looks like the admin's own app). Any other open session is closed first: one
 * clinic at a time. */
export async function startSupportSession(clinicId: string): Promise<void> {
  const { user } = await assertSuperadmin();
  const admin = createAdminClient();

  const { data: clinic } = await admin.from("clinics").select("id").eq("id", clinicId).maybeSingle();
  if (!clinic) throw new Error(await st("Clinic not found"));

  await closeOpenSessions(user.id);

  const { data: firstAdmin } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("clinic_id", clinicId)
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: session, error } = await admin
    .from("support_sessions")
    .insert({
      superadmin_id: user.id,
      clinic_id: clinicId,
      view_as_user_id: firstAdmin?.id ?? null,
      expires_at: minutesFromNow(SESSION_MINUTES),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordSupportEvent({
    sessionId: session.id,
    superadminId: user.id,
    clinicId,
    event: "session_started",
    detail: firstAdmin ? `viewing as ${firstAdmin.display_name || "admin"} (admin)` : "no active admin to view as",
  });

  redirect("/");
}

/** Switches whose app support is looking at — must be a member of the supported clinic. */
export async function setSupportViewAs(userId: string): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("profiles")
    .select("clinic_id, display_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!member || member.clinic_id !== session.clinic_id) throw new Error(await st("Not a member of this clinic"));

  const { error } = await admin.from("support_sessions").update({ view_as_user_id: userId }).eq("id", session.id);
  if (error) throw new Error(error.message);

  await recordSupportEvent({
    sessionId: session.id,
    superadminId: user.id,
    clinicId: session.clinic_id,
    event: "view_as_changed",
    detail: `${member.display_name || "Not signed in yet"} (${member.role})`,
  });
  revalidatePath("/", "layout");
}

/** The deliberate step before any change: writes are refused by the database until now. */
export async function unlockSupportEditing(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  // never past the session's own end
  const until = new Date(Math.min(Date.now() + EDITING_MINUTES * 60_000, Date.parse(session.expires_at))).toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from("support_sessions").update({ editing_until: until }).eq("id", session.id);
  if (error) throw new Error(error.message);

  await recordSupportEvent({
    sessionId: session.id,
    superadminId: user.id,
    clinicId: session.clinic_id,
    event: "editing_unlocked",
    detail: `until ${until}`,
  });
  revalidatePath("/", "layout");
}

export async function lockSupportEditing(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const admin = createAdminClient();
  const { error } = await admin.from("support_sessions").update({ editing_until: null }).eq("id", session.id);
  if (error) throw new Error(error.message);

  await recordSupportEvent({ sessionId: session.id, superadminId: user.id, clinicId: session.clinic_id, event: "editing_locked" });
  revalidatePath("/", "layout");
}

export async function extendSupportSession(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const expires = minutesFromNow(SESSION_MINUTES);
  const admin = createAdminClient();
  const { error } = await admin.from("support_sessions").update({ expires_at: expires }).eq("id", session.id);
  if (error) throw new Error(error.message);

  await recordSupportEvent({
    sessionId: session.id,
    superadminId: user.id,
    clinicId: session.clinic_id,
    event: "session_extended",
    detail: `until ${expires}`,
  });
  revalidatePath("/", "layout");
}

/** Closes the session and returns to that clinic's page in the platform area. */
export async function endSupportSession(): Promise<void> {
  const { user } = await assertSuperadmin();
  const closed = await closeOpenSessions(user.id);
  redirect(closed ? `/platform/clinics/${closed.clinic_id}` : "/platform");
}

/** Called by the support bar on every navigation inside the clinic app. Records the path
 * only — no page content. */
export async function logSupportPageView(path: string): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  await recordSupportEvent({
    sessionId: session.id,
    superadminId: user.id,
    clinicId: session.clinic_id,
    event: "page_viewed",
    path: path.slice(0, 300),
  });
}
