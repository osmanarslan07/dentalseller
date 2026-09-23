"use server";

import { randomBytes } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { assertSeatAvailable } from "@/lib/seats";
import { SellerRole } from "@/types";

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

export interface AddSellerResult {
  email: string;
  tempPassword: string;
}

/** Any active seller can add another — new accounts are always created as role 'seller'
 * (never 'admin'), so this can't be used to self-escalate privilege. */
export async function addSeller(rawEmail: string): Promise<AddSellerResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: myProfile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active, clinic_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!myProfile?.is_active) throw new Error("Your account isn't active");
  await assertSeatAvailable(myProfile.clinic_id);

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (error) {
    if (/already.*registered/i.test(error.message)) {
      throw new Error("A seller with that email already exists");
    }
    throw new Error(error.message);
  }

  // handle_new_user() only inserts a bare row (id, default role/clinic_id null) — the new
  // seller belongs to the inviting seller's own clinic, set via the admin client since RLS
  // only lets an admin update someone else's row (this action is deliberately open to any
  // active seller, not just admins).
  const { error: clinicIdError } = await admin
    .from("profiles")
    .update({ clinic_id: myProfile.clinic_id })
    .eq("id", data.user.id);
  if (clinicIdError) throw new Error(clinicIdError.message);

  await logActivity(supabase, user.id, "seller_added", "profile", null, email);

  revalidatePath("/settings");
  revalidatePath("/team");
  return { email, tempPassword };
}

/** Admin-only — enforced both here and by the profiles_guard_privilege DB trigger. */
export async function setSellerActive(sellerId: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (sellerId === user.id) throw new Error("You can't deactivate your own account");

  // Reactivating takes a seat back; RLS already confines this to the caller's own clinic.
  if (active) {
    const { data: myProfile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
    if (myProfile?.clinic_id) await assertSeatAvailable(myProfile.clinic_id);
  }

  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", sellerId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, active ? "seller_activated" : "seller_deactivated", "profile", sellerId);

  revalidatePath("/settings");
  revalidatePath("/team");
}

/** Admin-only — enforced both here and by the profiles_guard_privilege DB trigger. */
export async function setSellerRole(sellerId: string, role: SellerRole): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (sellerId === user.id) throw new Error("You can't change your own role");

  const { error } = await supabase.from("profiles").update({ role }).eq("id", sellerId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, role === "admin" ? "seller_promoted" : "seller_demoted", "profile", sellerId);

  revalidatePath("/settings");
  revalidatePath("/team");
}

/** For the two actions below that use the service-role client, which bypasses RLS: this JS
 * check is the only thing keeping a clinic admin to their own clinic's accounts. The target
 * must share the caller's clinic; any mismatch (another clinic, a superadmin, no such id)
 * reads as "not found", so ids from other clinics can't even be probed for existence. */
async function assertAdminOfSameClinic(supabase: SupabaseClient, callerId: string, targetId: string): Promise<void> {
  const { data: me } = await supabase.from("profiles").select("role, clinic_id").eq("id", callerId).maybeSingle();
  if (me?.role !== "admin" || !me.clinic_id) throw new Error("Admin only");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("clinic_id").eq("id", targetId).maybeSingle();
  if (!target || target.clinic_id !== me.clinic_id) throw new Error("Seller not found");
}

/** Admin-only. Uses the service-role client (auth.admin.* isn't exposed to RLS-scoped
 * clients), so the admin and same-clinic checks have to happen explicitly here — there's no
 * DB trigger to fall back on for this one. */
export async function adminResetPassword(sellerId: string): Promise<AddSellerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (sellerId === user.id) throw new Error("Use 'Change password' in Your account instead");

  await assertAdminOfSameClinic(supabase, user.id, sellerId);

  const admin = createAdminClient();
  const {
    data: { user: targetUser },
    error: fetchError,
  } = await admin.auth.admin.getUserById(sellerId);
  if (fetchError || !targetUser?.email) throw new Error("Seller not found");

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(sellerId, { password: tempPassword });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "password_reset", "profile", sellerId);

  return { email: targetUser.email, tempPassword };
}

/** Admin-only. Permanently deletes the auth user (and, via FK cascade, their profile row).
 * Patients/visits/quotes/tasks all FK-cascade straight off `auth.users`, so a bare delete
 * would silently wipe anything they owned — instead everything they owned is handed to the
 * admin doing the deletion first, via the service-role client (quotes/tasks RLS is strictly
 * own-row-only, with no admin carve-out, so the RLS-scoped client can't do this reassignment). */
export async function deleteSeller(sellerId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (sellerId === user.id) throw new Error("You can't delete your own account");

  await assertAdminOfSameClinic(supabase, user.id, sellerId);

  const admin = createAdminClient();
  const {
    data: { user: targetUser },
  } = await admin.auth.admin.getUserById(sellerId);

  const [{ count: patientCount }, { count: quoteCount }, { count: taskCount }] = await Promise.all([
    admin
      .from("patients")
      .update({ responsible_seller_id: user.id }, { count: "exact" })
      .eq("responsible_seller_id", sellerId),
    admin.from("quotes").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
    admin.from("tasks").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
  ]);
  await admin.from("patient_visits").update({ created_by_seller_id: user.id }).eq("created_by_seller_id", sellerId);

  const { error } = await admin.auth.admin.deleteUser(sellerId);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.id,
    "seller_deleted",
    "profile",
    null,
    `${targetUser?.email ?? sellerId} — reassigned ${patientCount ?? 0} patient(s), ${quoteCount ?? 0} quote(s), ${taskCount ?? 0} task(s) to self`
  );

  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/patients");
  revalidatePath("/quotes");
  revalidatePath("/tasks");
  revalidatePath("/");
}
