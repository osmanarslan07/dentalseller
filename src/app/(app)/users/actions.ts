"use server";

import { randomBytes } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { assertSeatAvailable } from "@/lib/seats";
import { assertViewerCanWrite } from "@/lib/viewer";
import { MEMBER_ROLES, MemberRole, roleLabel } from "@/types";
import { can, requirePermission } from "@/lib/permissions";
import { hasVisitToCome } from "@/lib/coordinators";
import { normalizePhone } from "@/lib/phone";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough to mean "until someone reactivates them". */
const BAN_FOREVER = "876000h";

function revalidateTeamPages() {
  revalidatePath("/users", "layout");
  revalidatePath("/settings", "layout");
  revalidatePath("/sales-performance");
}

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

export interface AddSellerResult {
  email: string;
  tempPassword: string;
}

/** The clinic's custom roles, key → name (RLS keeps it to the caller's clinic). */
async function customRoleNames(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("clinic_roles").select("key, name").eq("is_builtin", false);
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.name as string]));
}

/** At least one known role — a built-in or one of the clinic's own — each once. Anything else
 * from the client is refused (the database checks it again). */
function cleanRoles(roles: MemberRole[], custom: Record<string, string>): MemberRole[] {
  const known = [...MEMBER_ROLES, ...Object.keys(custom)] as MemberRole[];
  if (roles.some((r) => !known.includes(r))) throw new Error("Unknown role");
  const clean = known.filter((r) => roles.includes(r));
  if (clean.length === 0) throw new Error("Pick at least one role");
  return clean;
}

const rolesText = (roles: string[], custom: Record<string, string>) => roles.map((r) => roleLabel(r, custom)).join(", ");

/** team.manage. New members get the roles chosen here (Sales if none are passed). */
export async function addSeller(rawEmail: string, rawRoles: MemberRole[] = ["sales"]): Promise<AddSellerResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }

  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  const custom = await customRoleNames(supabase);
  const roles = cleanRoles(rawRoles, custom);

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

  await logActivity(supabase, user.actorId, "seller_added", "profile", null, `${email} (${rolesText(roles, custom)})`);

  revalidateTeamPages();
  return { email, tempPassword };
}

/** team.manage — enforced both here and by the profiles_guard_privilege DB trigger (which also
 * keeps a clinic's last active admin). A deactivated account is also blocked at the login:
 * it can't sign in or refresh an open session, and the little that is left of an open one
 * (at most an hour) finds every record closed by RLS and the app showing "deactivated". Their
 * patients, seller record and commission history stay as they are. */
export async function setSellerActive(sellerId: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (sellerId === user.id) throw new Error("You can't deactivate your own account");
  // the login block below uses the service role
  await assertAdminOfSameClinic(supabase, user.id, sellerId);
  assertViewerCanWrite(user.viewer);

  // Reactivating takes a seat back; RLS already confines this to the caller's own clinic.
  if (active) {
    const { data: myProfile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
    if (myProfile?.clinic_id) await assertSeatAvailable(myProfile.clinic_id);
  }

  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", sellerId);
  if (error) throw new Error(error.message);

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(sellerId, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banError) {
    throw new Error(`Saved, but ${active ? "unblocking" : "blocking"} their sign-in failed: ${banError.message}. Try again.`);
  }

  await logActivity(supabase, user.actorId, active ? "seller_activated" : "seller_deactivated", "profile", sellerId);

  revalidateTeamPages();
}

/** team.manage — enforced both here and by the profiles_guard_privilege DB trigger, which also
 * refuses changing your own roles and removing a clinic's last admin. */
export async function setMemberRoles(memberId: string, rawRoles: MemberRole[]): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (memberId === user.id) throw new Error("You can't change your own roles");
  const custom = await customRoleNames(supabase);
  const roles = cleanRoles(rawRoles, custom);

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
    `${rolesText(before.roles ?? [], custom) || "none"} → ${rolesText(roles, custom)}`
  );

  revalidateTeamPages();
}

/** team.manage: a member's name and phone, e.g. entered by the admin for someone who rarely
 * signs in. RLS (profiles_update_self_or_admin) confines it to the caller's clinic. Your own
 * details are changed on My profile. */
export async function updateMemberProfile(memberId: string, rawName: string, rawPhone: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (memberId === user.id) throw new Error("Change your own details on My profile");
  const name = rawName.trim();
  if (name.length > 60) throw new Error("Name must be 60 characters or fewer");
  const phone = normalizePhone(rawPhone);

  const { data: before } = await supabase.from("profiles").select("display_name, phone").eq("id", memberId).maybeSingle();
  if (!before) throw new Error("Team member not found");
  // an invited member keeps an empty name until they choose one at first sign-in
  const displayName = name || before.display_name;
  if (before.display_name && !name) throw new Error("Please enter a name");

  const { error } = await supabase.from("profiles").update({ display_name: displayName, phone }).eq("id", memberId);
  if (error) {
    if (error.code === "23505") throw new Error("Someone else in this clinic already has that phone number");
    throw new Error(error.message);
  }

  const changes: string[] = [];
  if ((before.display_name ?? "") !== (displayName ?? "")) changes.push(`name: ${before.display_name || "—"} → ${displayName}`);
  if ((before.phone ?? null) !== phone) changes.push(`phone: ${before.phone || "—"} → ${phone || "—"}`);
  if (changes.length > 0) {
    await logActivity(supabase, user.actorId, "member_profile_updated", "profile", memberId, changes.join("; "));
  }

  revalidateTeamPages();
}

/** For the actions here that use the service-role client, which bypasses RLS (the caller's
 * team.manage / team.delete is checked by requirePermission first): this JS check is the only
 * thing keeping a clinic admin to their own clinic's accounts. The target must share the
 * caller's clinic; any mismatch (another clinic, a superadmin, no such id) reads as "not
 * found", so ids from other clinics can't even be probed for existence. Returns the clinic. */
async function assertAdminOfSameClinic(supabase: SupabaseClient, callerId: string, targetId: string): Promise<string> {
  const { data: me } = await supabase.from("profiles").select("clinic_id").eq("id", callerId).maybeSingle();
  if (!me?.clinic_id) throw new Error("Admin only");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("clinic_id").eq("id", targetId).maybeSingle();
  if (!target || target.clinic_id !== me.clinic_id) throw new Error("Seller not found");
  return me.clinic_id as string;
}

/** Admin-only. Uses the service-role client (auth.admin.* isn't exposed to RLS-scoped
 * clients), so the admin and same-clinic checks have to happen explicitly here — there's no
 * DB trigger to fall back on for this one. */
export async function adminResetPassword(sellerId: string): Promise<AddSellerResult> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (sellerId === user.id) throw new Error("Change your own password on My profile");

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

/** team.delete. Permanently deletes the auth user (and, via FK cascade, their profile row).
 * - Patients they sell stay theirs: patients point at the seller record, which just loses its
 *   login and carries on as a seller without an account (commission history intact).
 * - Patients they coordinate would lose their coordinator (FK set null) unless handed to
 *   another active member of the clinic here.
 * - Quotes, tasks and the extra visits they created FK-cascade straight off `auth.users`, so
 *   those are handed to the admin doing the deletion first, via the service-role client
 *   (quotes/tasks RLS is strictly own-row-only, with no admin carve-out).
 * - Their activity history keeps their id in former_actor_id (actor_id is cleared by the FK),
 *   which still names them through the surviving seller record.
 * - Sessions: the login is gone, so an open session can't be refreshed, and RLS finds no
 *   active profile behind what is left of it. */
export async function deleteSeller(sellerId: string, coordinatorHandoverTo: string | null = null): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("team.delete");
  if (sellerId === user.id) throw new Error("You can't delete your own account");

  const clinicId = await assertAdminOfSameClinic(supabase, user.id, sellerId);
  assertViewerCanWrite(user.viewer);

  const admin = createAdminClient();
  const [{ data: target }, { data: otherAdmins }] = await Promise.all([
    admin.from("profiles").select("role, is_active").eq("id", sellerId).maybeSingle(),
    admin.from("profiles").select("id").eq("clinic_id", clinicId).eq("role", "admin").eq("is_active", true).neq("id", sellerId).limit(1),
  ]);
  // the database guards this for updates only; a delete has to check it here
  if (target?.role === "admin" && target.is_active && (otherAdmins ?? []).length === 0) {
    throw new Error("A clinic needs at least one active admin");
  }

  if (coordinatorHandoverTo) {
    if (coordinatorHandoverTo === sellerId) throw new Error("Pick someone else to take over their patients");
    const { data: heir } = await admin
      .from("profiles")
      .select("clinic_id, is_active")
      .eq("id", coordinatorHandoverTo)
      .maybeSingle();
    const { data: heirCanEdit } = await admin.rpc("has_permission", { uid: coordinatorHandoverTo, perm: "patients.edit" });
    if (!heir || heir.clinic_id !== clinicId || !heir.is_active || !heirCanEdit) {
      throw new Error("That team member can't take over their patients");
    }
  }

  const {
    data: { user: targetUser },
  } = await admin.auth.admin.getUserById(sellerId);

  // the seller record outlives the login, so it needs a name of its own if they never set one
  const { data: sellerRow } = await admin.from("sellers").select("name").eq("id", sellerId).maybeSingle();
  if (sellerRow && !sellerRow.name?.trim() && targetUser?.email) {
    await admin.from("sellers").update({ name: targetUser.email.split("@")[0] }).eq("id", sellerId);
  }

  const [{ count: patientCount }, { count: quoteCount }, { count: taskCount }, { count: coordinatedCount }] = await Promise.all([
    admin.from("patients").select("id", { count: "exact", head: true }).eq("responsible_seller_id", sellerId),
    admin.from("quotes").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
    admin.from("tasks").update({ user_id: user.id }, { count: "exact" }).eq("user_id", sellerId),
    coordinatorHandoverTo
      ? admin
          .from("patients")
          .update({ coordinator_id: coordinatorHandoverTo }, { count: "exact" })
          .eq("clinic_id", clinicId)
          .eq("coordinator_id", sellerId)
      : admin.from("patients").select("id", { count: "exact", head: true }).eq("coordinator_id", sellerId),
  ]);
  await admin.from("patient_visits").update({ created_by_seller_id: user.id }).eq("created_by_seller_id", sellerId);
  const { error: historyError } = await admin
    .from("activity_log")
    .update({ former_actor_id: sellerId })
    .eq("clinic_id", clinicId)
    .eq("actor_id", sellerId);
  if (historyError) throw new Error(historyError.message);

  const { error } = await admin.auth.admin.deleteUser(sellerId);
  if (error) throw new Error(error.message);

  const coordinated = coordinatedCount
    ? coordinatorHandoverTo
      ? `; moved ${coordinatedCount} coordinated patient(s) to another member`
      : `; ${coordinatedCount} coordinated patient(s) left without a coordinator`
    : "";
  await logActivity(
    supabase,
    user.actorId,
    "seller_deleted",
    "profile",
    sellerId,
    `${targetUser?.email ?? sellerId} — kept ${patientCount ?? 0} patient(s) as a seller without an account; reassigned ${quoteCount ?? 0} quote(s), ${taskCount ?? 0} task(s) to self${coordinated}`
  );

  revalidateTeamPages();
  revalidatePath("/patients");
  revalidatePath("/quotes");
  revalidatePath("/tasks");
  revalidatePath("/");
}

/** Hands every patient one member coordinates to another (or to nobody): someone leaves, or
 * is away. Needs team.manage and patients.edit. Runs through RLS (this clinic's patients
 * only), and the database refuses a new coordinator from another clinic or without
 * patients.edit. Logged once on the member and once on each patient, so every patient's
 * History shows the change. Returns how many patients moved. */
export async function handOverCoordinatedPatients(
  fromId: string,
  toId: string | null,
  onlyWithVisitToCome: boolean
): Promise<number> {
  const supabase = await createClient();
  const user = await requirePermission("team.manage");
  if (!can(user.viewer, "patients.edit")) throw new Error("You don't have permission to do that");
  if (!UUID_RE.test(fromId) || (toId !== null && !UUID_RE.test(toId))) throw new Error("Team member not found");
  if (toId === fromId) throw new Error("Pick someone else to take over");

  const { data: people } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", toId ? [fromId, toId] : [fromId]);
  const nameOf = (id: string | null) =>
    id ? ((people ?? []).find((p) => p.id === id)?.display_name as string | null) || "Unnamed member" : "nobody";
  if (!(people ?? []).some((p) => p.id === fromId) || (toId && !(people ?? []).some((p) => p.id === toId))) {
    throw new Error("Team member not found");
  }

  const { data: patients, error: readError } = await supabase
    .from("patients")
    .select("id, visit1_status, visit2_status, needs_visit2, extra_visits:patient_visits(status)")
    .eq("coordinator_id", fromId);
  if (readError) throw new Error(readError.message);
  const ids = (patients ?? [])
    .filter((p) => !onlyWithVisitToCome || hasVisitToCome(p))
    .map((p) => p.id as string);
  if (ids.length === 0) return 0;

  const { error, count } = await supabase
    .from("patients")
    .update({ coordinator_id: toId }, { count: "exact" })
    .in("id", ids)
    .eq("coordinator_id", fromId);
  if (error) throw new Error(error.message);

  const change = `coordinator ${nameOf(fromId)} → ${nameOf(toId)} (handover)`;
  const { error: logError } = await supabase.from("activity_log").insert([
    {
      actor_id: user.actorId,
      action: "coordinator_handover",
      target_type: "profile",
      target_id: fromId,
      detail: `${count ?? ids.length} patient(s) to ${nameOf(toId)}${onlyWithVisitToCome ? " (only those with a visit to come)" : ""}`,
    },
    ...ids.map((id) => ({ actor_id: user.actorId, action: "patient_updated", target_type: "patient", target_id: id, detail: change })),
  ]);
  if (logError) console.error("Activity log write failed:", logError.message);

  revalidateTeamPages();
  revalidatePath("/patients", "layout");
  revalidatePath("/");
  return count ?? ids.length;
}
