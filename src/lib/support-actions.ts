"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSuperadmin } from "@/lib/platform";

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
  if (!data) throw new Error("No open support session");
  return data;
}

/** Opens a clinic in support mode — view-only, viewing as the clinic's first active admin
 * (so it looks like the admin's own app). Any other open session is closed first: one
 * clinic at a time. */
export async function startSupportSession(clinicId: string): Promise<void> {
  const { user } = await assertSuperadmin();
  const admin = createAdminClient();

  const { data: clinic } = await admin.from("clinics").select("id").eq("id", clinicId).maybeSingle();
  if (!clinic) throw new Error("Clinic not found");

  const now = new Date().toISOString();
  await admin
    .from("support_sessions")
    .update({ ended_at: now, editing_until: null })
    .eq("superadmin_id", user.id)
    .is("ended_at", null);

  const { data: firstAdmin } = await admin
    .from("profiles")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("support_sessions").insert({
    superadmin_id: user.id,
    clinic_id: clinicId,
    view_as_user_id: firstAdmin?.id ?? null,
    expires_at: minutesFromNow(SESSION_MINUTES),
  });
  if (error) throw new Error(error.message);

  redirect("/");
}

/** Switches whose app support is looking at — must be a member of the supported clinic. */
export async function setSupportViewAs(userId: string): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const admin = createAdminClient();

  const { data: member } = await admin.from("profiles").select("clinic_id").eq("id", userId).maybeSingle();
  if (member?.clinic_id !== session.clinic_id) throw new Error("Not a member of this clinic");

  const { error } = await admin.from("support_sessions").update({ view_as_user_id: userId }).eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** The deliberate step before any change: writes are refused by the database until now. */
export async function unlockSupportEditing(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  // never past the session's own end
  const until = Math.min(Date.now() + EDITING_MINUTES * 60_000, Date.parse(session.expires_at));
  const admin = createAdminClient();
  const { error } = await admin
    .from("support_sessions")
    .update({ editing_until: new Date(until).toISOString() })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function lockSupportEditing(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const admin = createAdminClient();
  const { error } = await admin.from("support_sessions").update({ editing_until: null }).eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function extendSupportSession(): Promise<void> {
  const { user } = await assertSuperadmin();
  const session = await getOpenSession(user.id);
  const admin = createAdminClient();
  const { error } = await admin
    .from("support_sessions")
    .update({ expires_at: minutesFromNow(SESSION_MINUTES) })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Closes the session and returns to that clinic's page in the platform area. */
export async function endSupportSession(): Promise<void> {
  const { user } = await assertSuperadmin();
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("support_sessions")
    .select("id, clinic_id")
    .eq("superadmin_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin
    .from("support_sessions")
    .update({ ended_at: new Date().toISOString(), editing_until: null })
    .eq("superadmin_id", user.id)
    .is("ended_at", null);
  redirect(open ? `/platform/clinics/${open.clinic_id}` : "/platform");
}
