"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { assertSuperadmin } from "@/lib/platform";

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CredentialResult {
  email: string;
  tempPassword: string;
}

export interface CreateClinicResult extends CredentialResult {
  clinicId: string;
}

function parseClinicFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!name) throw new Error("Clinic name is required");
  if (!SLUG_RE.test(slug)) throw new Error("Slug may only use lowercase letters, numbers and single dashes");
  return { name, slug };
}

function friendlyClinicError(message: string): string {
  return /clinics_slug_key|duplicate key/i.test(message) ? "That slug is already taken by another clinic" : message;
}

/** Creates the clinic, its branding row and its first admin in one go. The Auth API call
 * can't share a transaction with the DB writes, so a failure part-way through is undone by
 * hand — no half-created clinic with no way in. */
export async function createClinic(formData: FormData): Promise<CreateClinicResult> {
  const { supabase, user } = await assertSuperadmin();
  const { name, slug } = parseClinicFields(formData);
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  if (!adminName) throw new Error("Admin name is required");
  if (!EMAIL_RE.test(adminEmail)) throw new Error("Enter a valid admin email address");

  const admin = createAdminClient();
  const { data: clinic, error: clinicError } = await admin.from("clinics").insert({ name, slug }).select("id").single();
  if (clinicError) throw new Error(friendlyClinicError(clinicError.message));

  const rollbackClinic = async () => {
    await admin.from("clinic_config").delete().eq("clinic_id", clinic.id);
    await admin.from("clinics").delete().eq("id", clinic.id);
  };

  // Without its own row, a new clinic's letters and offers would fall back to the defaults
  // (another clinic's name and address). The admin fills in the rest from Settings.
  const { error: configError } = await admin.from("clinic_config").insert({
    clinic_id: clinic.id,
    clinic_name: name,
    clinic_short_name: name,
    clinic_address: "",
    clinic_phone: "",
    clinic_email: "",
  });
  if (configError) {
    await rollbackClinic();
    throw new Error(configError.message);
  }

  const tempPassword = generateTempPassword();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
  });
  if (userError) {
    await rollbackClinic();
    throw new Error(/already.*registered/i.test(userError.message) ? "An account with that email already exists" : userError.message);
  }

  // handle_new_user() inserted a bare seller row with no clinic; the service role may assign
  // it once (guard_profile_privilege_change).
  const { error: profileError } = await admin
    .from("profiles")
    .update({ clinic_id: clinic.id, role: "admin", display_name: adminName })
    .eq("id", created.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    await rollbackClinic();
    throw new Error(profileError.message);
  }

  await logActivity(supabase, user.id, "clinic_created", "clinic", clinic.id, `${name} — first admin ${adminEmail}`);

  revalidatePath("/platform");
  return { clinicId: clinic.id, email: adminEmail, tempPassword };
}

export async function updateClinic(clinicId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await assertSuperadmin();
  const { name, slug } = parseClinicFields(formData);

  const admin = createAdminClient();
  const { error } = await admin.from("clinics").update({ name, slug }).eq("id", clinicId);
  if (error) throw new Error(friendlyClinicError(error.message));

  await logActivity(supabase, user.id, "clinic_updated", "clinic", clinicId, `${name} (${slug})`);

  revalidatePath("/platform");
  revalidatePath(`/platform/clinics/${clinicId}`);
}

/** Suspending locks the clinic's whole team out at the RLS level (is_active_profile) — their
 * data stays untouched and comes straight back on reactivation. */
export async function setClinicActive(clinicId: string, active: boolean): Promise<void> {
  const { supabase, user } = await assertSuperadmin();

  const admin = createAdminClient();
  const { error } = await admin.from("clinics").update({ is_active: active }).eq("id", clinicId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, active ? "clinic_reactivated" : "clinic_suspended", "clinic", clinicId);

  revalidatePath("/platform");
  revalidatePath(`/platform/clinics/${clinicId}`);
}

/** For a clinic user locked out with nobody at their clinic able to help (e.g. its only
 * admin). Same temp-password handoff as adminResetPassword. */
export async function resetClinicUserPassword(userId: string): Promise<CredentialResult> {
  const { supabase, user } = await assertSuperadmin();
  if (userId === user.id) throw new Error("Change your own password from your account instead");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("clinic_id").eq("id", userId).maybeSingle();
  if (!target?.clinic_id) throw new Error("Only clinic users can be reset from here");

  const {
    data: { user: targetUser },
    error: fetchError,
  } = await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser?.email) throw new Error("User not found");

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "password_reset", "profile", userId);

  return { email: targetUser.email, tempPassword };
}

export async function addSuperadmin(rawEmail: string, rawName: string): Promise<CredentialResult> {
  const { supabase, user } = await assertSuperadmin();
  const email = rawEmail.trim().toLowerCase();
  const displayName = rawName.trim();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
  if (!displayName) throw new Error("Name is required");

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (error) {
    throw new Error(/already.*registered/i.test(error.message) ? "An account with that email already exists" : error.message);
  }

  // clinic_id stays null — profiles_clinic_role_check forbids a superadmin with a clinic
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "superadmin", display_name: displayName })
    .eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }

  await logActivity(supabase, user.id, "superadmin_added", "profile", data.user.id, email);

  revalidatePath("/platform/superadmins");
  return { email, tempPassword };
}
