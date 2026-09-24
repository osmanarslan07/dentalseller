"use server";

import { randomBytes } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { assertSeatAvailable } from "@/lib/seats";
import { assertViewerCanWrite } from "@/lib/viewer";
import { MEMBER_ROLES, MemberRole, ROLE_LABELS } from "@/types";
import { requirePermission } from "@/lib/permissions";

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

export interface AddSellerResult {
  email: string;
  tempPassword: string;
}

/** At least one known role, each once — anything else from the client is refused. */
function cleanRoles(roles: MemberRole[]): MemberRole[] {
  const clean = MEMBER_ROLES.filter((r) => roles.includes(r));
  if (clean.length === 0) throw new Error("Pick at least one role");
  if (roles.some((r) => !MEMBER_ROLES.includes(r))) throw new Error("Unknown role");
  return clean;
}

const rolesText = (roles: MemberRole[]) => roles.map((r) => ROLE_LABELS[r]).join(", ");

/** team.manage. New members get the roles chosen here (Sales if none are passed). */
export async function addSeller(rawEmail: string, rawRoles: MemberRole[] = ["sales"]): Promise<AddSellerResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
  const roles = cleanRoles(rawRoles);

  const supabase = await createClient();
  const user = await requirePermission("team.manage");

  const { data: myProfile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active, clinic_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!myProfile?.is_active) throw new Error("Your account isn't active");
  // creating the login uses the service role, which the DB's read-only rule can't see
  assertViewerCanWrite(user.viewer);
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

  // handle_new_user() only inserts a bare row (id, default roles, clinic_id null) — the new
  // member belongs to the inviting admin's own clinic, set via the admin client since a
  // profile's clinic is only ever assigned by the service role.
  const { error: clinicIdError } = await admin
    .from("profiles")
    .update({ clinic_id: myProfile.clinic_id, roles })
    .eq("id", data.user.id);
  if (clinicIdError) throw new Error(clinicIdError.message);

  await logActivity(supabase, user.actorId, "seller_added", "profile", null, `${email} (${rolesText(roles)})`);

  revalidatePath("/settings");
  revalidatePath("/team");
  return { email, tempPassword };
}

/** Admin-only — enforced both here and by the profiles_guard_privilege DB trigger. */
export async function setSellerActive(sellerId: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (sellerId === user.id) throw new Error("You can't deactivate your own account");

  // Reactivating takes a seat back; RLS already confines this to the caller's own clinic.
  if (active) {
    const { data: myProfile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
    if (myProfile?.clinic_id) await assertSeatAvailable(myProfile.clinic_id);
  }

  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", sellerId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, active ? "seller_activated" : "seller_deactivated", "profile", sellerId);

  revalidatePath("/settings");
  revalidatePath("/team");
}

/** team.manage — enforced both here and by the profiles_guard_privilege DB trigger, which also
 * refuses changing your own roles and removing a clinic's last admin. */
export async function setMemberRoles(memberId: string, rawRoles: MemberRole[]): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (memberId === user.id) throw new Error("You can't change your own roles");
  const roles = cleanRoles(rawRoles);

  const { data: before } = await supabase.from("profiles").select("roles").eq("id", memberId).maybeSingle();
  if (!before) throw new Error("Team member not found");

  const { error } = await supabase.from("profiles").update({ roles }).eq("id", memberId);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "member_roles_changed",
    "profile",
    memberId,
    `${rolesText((before.roles ?? []) as MemberRole[]) || "none"} → ${rolesText(roles)}`
  );

  revalidatePath("/settings");
  revalidatePath("/team");
}

/** For the two actions below that use the service-role client, which bypasses RLS (the caller's
 * team.manage is checked by requirePermission first): this JS
 * check is the only thing keeping a clinic admin to their own clinic's accounts. The target
 * must share the caller's clinic; any mismatch (another clinic, a superadmin, no such id)
 * reads as "not found", so ids from other clinics can't even be probed for existence. */
async function assertAdminOfSameClinic(supabase: SupabaseClient, callerId: string, targetId: string): Promise<void> {
  const { data: me } = await supabase.from("profiles").select("clinic_id").eq("id", callerId).maybeSingle();
  if (!me?.clinic_id) throw new Error("Admin only");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("clinic_id").eq("id", targetId).maybeSingle();
  if (!target || target.clinic_id !== me.clinic_id) throw new Error("Seller not found");
}

/** Admin-only. Uses the service-role client (auth.admin.* isn't exposed to RLS-scoped
 * clients), so the admin and same-clinic checks have to happen explicitly here — there's no
 * DB trigger to fall back on for this one. */
export async function adminResetPassword(sellerId: string): Promise<AddSellerResult> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (sellerId === user.id) throw new Error("Use 'Change password' in Your account instead");

  await assertAdminOfSameClinic(supabase, user.id, sellerId);
  assertViewerCanWrite(user.viewer);

  const admin = createAdminClient();
  const {
    data: { user: targetUser },
    error: fetchError,
  } = await admin.auth.admin.getUserById(sellerId);
  if (fetchError || !targetUser?.email) throw new Error("Seller not found");

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(sellerId, { password: tempPassword });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "password_reset", "profile", sellerId);

  return { email: targetUser.email, tempPassword };
}

/** Admin-only. Permanently deletes the auth user (and, via FK cascade, their profile row).
 * Their patients stay theirs: patients point at the seller record, which just loses its login
 * and carries on as a seller without an account (commission history intact). Quotes, tasks and
 * the extra visits they created FK-cascade straight off `auth.users`, so those are handed to
 * the admin doing the deletion first, via the service-role client (quotes/tasks RLS is
 * strictly own-row-only, with no admin carve-out, so the RLS-scoped client can't do this). */
export async function deleteSeller(sellerId: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (sellerId === user.id) throw new Error("You can't delete your own account");

  await assertAdminOfSameClinic(supabase, user.id, sellerId);
  assertViewerCanWrite(user.viewer);

  const admin = createAdminClient();
  const {
    data: { user: targetUser },
  } = await admin.auth.admin.getUserById(sellerId);

  // the seller record outlives the login, so it needs a name of its own if they never set one
  const { data: sellerRow } = await admin.from("sellers").select("name").eq("id", sellerId).maybeSingle();
  if (sellerRow && !sellerRow.name?.trim() && targetUser?.email) {
    await admin.from("sellers").update({ name: targetUser.email.split("@")[0] }).eq("id", sellerId);
  }

  const [{ count: patientCount }, { count: quoteCount }, { count: taskCount }] = await Promise.all([
    admin.from("patients").select("id", { count: "exact", head: true }).eq("responsible_seller_id", sellerId),
    admin.from("quotes").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
    admin.from("tasks").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
  ]);
  await admin.from("patient_visits").update({ created_by_seller_id: user.id }).eq("created_by_seller_id", sellerId);

  const { error } = await admin.auth.admin.deleteUser(sellerId);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "seller_deleted",
    "profile",
    null,
    `${targetUser?.email ?? sellerId} — kept ${patientCount ?? 0} patient(s) as a seller without an account; reassigned ${quoteCount ?? 0} quote(s), ${taskCount ?? 0} task(s) to self`
  );

  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/patients");
  revalidatePath("/quotes");
  revalidatePath("/tasks");
  revalidatePath("/");
}
