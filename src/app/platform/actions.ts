"use server";

import { msg } from "@/i18n";
import { st } from "@/i18n/server";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { assertSuperadmin } from "@/lib/platform";
import { BILLING_CURRENCIES, formatPrice, Plan, PLAN_LABELS, PLANS } from "@/lib/clinic-billing";
import {
  ANNOUNCEMENT_LEVEL_LABELS,
  ANNOUNCEMENT_LEVELS,
  ANNOUNCEMENT_MAX_LENGTH,
  AnnouncementLevel,
} from "@/lib/announcements";
import { CLINIC_MODULES } from "@/types";
import { isSupportedCurrency } from "@/lib/money";
import { grantablePermissions } from "@/lib/permission-catalog";
import { getRoleTemplates } from "@/lib/roles";

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
  if (!name) throw new Error(msg("Clinic name is required"));
  if (!SLUG_RE.test(slug)) throw new Error(msg("Slug may only use lowercase letters, numbers and single dashes"));
  return { name, slug };
}

function friendlyClinicError(message: string): string {
  return /clinics_slug_key|duplicate key/i.test(message) ? "That slug is already taken by another clinic" : message;
}

/** Creates the clinic, its branding row and its first admin in one go. The Auth API call
 * can't share a transaction with the DB writes, so a failure part-way through is undone by
 * hand — no half-created clinic with no way in. */
export async function createClinic(formData: FormData): Promise<CreateClinicResult> {
  const { user } = await assertSuperadmin();
  const { name, slug } = parseClinicFields(formData);
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  if (!adminName) throw new Error(await st("Admin name is required"));
  if (!EMAIL_RE.test(adminEmail)) throw new Error(await st("Enter a valid admin email address"));
  const mainCurrency = String(formData.get("main_currency") ?? "GBP");
  if (!isSupportedCurrency(mainCurrency)) throw new Error(await st("Pick the clinic's main currency"));

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
    main_currency: mainCurrency,
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

  await logActivity(createAdminClient(), user.id, "clinic_created", "clinic", clinic.id, `${name} — first admin ${adminEmail}`);

  revalidatePath("/platform");
  return { clinicId: clinic.id, email: adminEmail, tempPassword };
}

export async function updateClinic(clinicId: string, formData: FormData): Promise<void> {
  const { user } = await assertSuperadmin();
  const { name, slug } = parseClinicFields(formData);

  const admin = createAdminClient();
  const { error } = await admin.from("clinics").update({ name, slug }).eq("id", clinicId);
  if (error) throw new Error(friendlyClinicError(error.message));

  await logActivity(createAdminClient(), user.id, "clinic_updated", "clinic", clinicId, `${name} (${slug})`);

  revalidatePath("/platform");
  revalidatePath(`/platform/clinics/${clinicId}`);
}

/** Suspending locks the clinic's whole team out at the RLS level (is_active_profile) — their
 * data stays untouched and comes straight back on reactivation. */
export async function setClinicActive(clinicId: string, active: boolean): Promise<void> {
  const { user } = await assertSuperadmin();

  const admin = createAdminClient();
  const { error } = await admin.from("clinics").update({ is_active: active }).eq("id", clinicId);
  if (error) throw new Error(error.message);

  await logActivity(createAdminClient(), user.id, active ? "clinic_reactivated" : "clinic_suspended", "clinic", clinicId);

  revalidatePath("/platform");
  revalidatePath(`/platform/clinics/${clinicId}`);
}

/** For a clinic user locked out with nobody at their clinic able to help (e.g. its only
 * admin). Same temp-password handoff as adminResetPassword. */
export async function resetClinicUserPassword(userId: string): Promise<CredentialResult> {
  const { user } = await assertSuperadmin();
  if (userId === user.id) throw new Error(await st("Change your own password from your account instead"));

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("clinic_id").eq("id", userId).maybeSingle();
  if (!target?.clinic_id) throw new Error(await st("Only clinic users can be reset from here"));

  const {
    data: { user: targetUser },
    error: fetchError,
  } = await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser?.email) throw new Error(await st("User not found"));

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) throw new Error(error.message);

  await logActivity(createAdminClient(), user.id, "password_reset", "profile", userId);

  return { email: targetUser.email, tempPassword };
}

export async function addSuperadmin(rawEmail: string, rawName: string): Promise<CredentialResult> {
  const { user } = await assertSuperadmin();
  const email = rawEmail.trim().toLowerCase();
  const displayName = rawName.trim();
  if (!EMAIL_RE.test(email)) throw new Error(await st("Enter a valid email address"));
  if (!displayName) throw new Error(await st("Name is required"));

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

  await logActivity(createAdminClient(), user.id, "superadmin_added", "profile", data.user.id, email);

  revalidatePath("/platform/superadmins");
  return { email, tempPassword };
}

function optionalNumber(formData: FormData, key: string, label: string, { integer = false } = {}): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be a ${integer ? "whole " : ""}number of 0 or more`);
  }
  return value;
}

/** Record-keeping only — no payment is taken. Upserted: a clinic has no row until its first
 * plan is saved. */
export async function updateClinicBilling(clinicId: string, formData: FormData): Promise<void> {
  const { user } = await assertSuperadmin();

  const plan = String(formData.get("plan") ?? "") as Plan;
  if (!PLANS.includes(plan)) throw new Error(await st("Choose a plan"));
  const currency = String(formData.get("currency") ?? "");
  if (!(BILLING_CURRENCIES as readonly string[]).includes(currency)) throw new Error(await st("Choose a currency"));

  const seatLimit = optionalNumber(formData, "seat_limit", "Seat limit", { integer: true });
  if (seatLimit === 0) throw new Error(await st("Seat limit must be at least 1, or blank for unlimited"));
  const monthlyPrice = optionalNumber(formData, "monthly_price", "Monthly price");
  // A trial end date only means something on the trial plan — don't leave a stale one behind.
  const trialEndsAt = plan === "trial" ? String(formData.get("trial_ends_at") ?? "").trim() || null : null;
  if (trialEndsAt && !/^\d{4}-\d{2}-\d{2}$/.test(trialEndsAt)) throw new Error(await st("Enter a valid trial end date"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const modules = CLINIC_MODULES.filter((m) => formData.getAll("modules").includes(m));

  const admin = createAdminClient();
  const { error: modulesError } = await admin.from("clinics").update({ modules }).eq("id", clinicId);
  if (modulesError) throw new Error(modulesError.message);
  const { error } = await admin.from("clinic_billing").upsert({
    clinic_id: clinicId,
    plan,
    seat_limit: seatLimit,
    trial_ends_at: trialEndsAt,
    monthly_price: monthlyPrice,
    currency,
    notes,
  });
  if (error) throw new Error(error.message);

  const summary = [
    PLAN_LABELS[plan],
    seatLimit ? `${seatLimit} seats` : "unlimited seats",
    monthlyPrice !== null && `${formatPrice(monthlyPrice, currency)}/month`,
    trialEndsAt && `trial ends ${trialEndsAt}`,
    `modules: ${modules.join(", ") || "core only"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  await logActivity(createAdminClient(), user.id, "clinic_billing_updated", "clinic", clinicId, summary);

  revalidatePath("/platform");
  revalidatePath(`/platform/clinics/${clinicId}`);
}

function excerpt(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
}

/** `starts_at` / `ends_at` arrive as ISO strings — the form converts the superadmin's local
 * datetime-local input to UTC before submitting, so no time zone guessing happens here. */
function optionalIso(formData: FormData, key: string, label: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw new Error(`Enter a valid ${label}`);
  return new Date(ms).toISOString();
}

export async function createAnnouncement(formData: FormData): Promise<void> {
  const { supabase, user } = await assertSuperadmin();

  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error(await st("Write a message"));
  if (message.length > ANNOUNCEMENT_MAX_LENGTH) throw new Error(`Keep it under ${ANNOUNCEMENT_MAX_LENGTH} characters`);

  const level = String(formData.get("level") ?? "") as AnnouncementLevel;
  if (!ANNOUNCEMENT_LEVELS.includes(level)) throw new Error(await st("Choose a level"));

  let clinicIds: string[] | null = null;
  if (formData.get("audience") === "selected") {
    clinicIds = formData.getAll("clinic_ids").map(String).filter(Boolean);
    if (clinicIds.length === 0) throw new Error(await st("Pick at least one clinic, or send it to all clinics"));
  }

  const startsAt = optionalIso(formData, "starts_at", "start time") ?? new Date().toISOString();
  const endsAt = optionalIso(formData, "ends_at", "end time");
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(await st("The end time must be after the start time"));
  if (endsAt && Date.parse(endsAt) <= Date.now()) throw new Error(await st("The end time is already in the past"));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .insert({ message, level, clinic_ids: clinicIds, starts_at: startsAt, ends_at: endsAt, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const audience = clinicIds ? `${clinicIds.length} clinic${clinicIds.length === 1 ? "" : "s"}` : "all clinics";
  await logActivity(
    supabase,
    user.id,
    "announcement_created",
    "announcement",
    data.id,
    `${ANNOUNCEMENT_LEVEL_LABELS[level]} to ${audience}: "${excerpt(message)}"`
  );

  revalidatePath("/platform/announcements");
}

/** Takes a live or scheduled announcement down now; it stays in the list as ended. */
export async function endAnnouncement(id: string): Promise<void> {
  const { user } = await assertSuperadmin();

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("announcements")
    .select("message, starts_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error(await st("Announcement not found"));

  const now = Date.now();
  // A scheduled one that never started gets its start pulled back just before the end, so
  // the ends_at > starts_at check still holds.
  const update =
    Date.parse(existing.starts_at) >= now
      ? { starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now).toISOString() }
      : { ends_at: new Date(now).toISOString() };
  const { error } = await admin.from("announcements").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(createAdminClient(), user.id, "announcement_ended", "announcement", id, `"${excerpt(existing.message)}"`);

  revalidatePath("/platform/announcements");
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { user } = await assertSuperadmin();

  const admin = createAdminClient();
  const { data, error } = await admin.from("announcements").delete().eq("id", id).select("message").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(await st("Announcement not found"));

  await logActivity(createAdminClient(), user.id, "announcement_deleted", "announcement", id, `"${excerpt(data.message)}"`);

  revalidatePath("/platform/announcements");
}

/** The default permissions of a built-in role (Admin always has everything). Every clinic
 * that hasn't changed that role follows it at once; clinics that have keep their own version,
 * though a permission added to the catalog later still reaches them with its default. */
export async function updateRoleTemplate(role: string, permissions: string[]): Promise<void> {
  const { user } = await assertSuperadmin();
  if (!["sales", "coordinator", "accountant"].includes(role)) throw new Error(await st("Only Sales, Coordinator and Accountant have templates"));
  const perms = grantablePermissions(permissions);

  const admin = createAdminClient();
  const before = (await getRoleTemplates(admin))[role as "sales" | "coordinator" | "accountant"];
  if (perms.length > 0) {
    const { error } = await admin
      .from("role_permissions")
      .upsert(perms.map((permission) => ({ role, permission })), { onConflict: "role,permission", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const removed = before.filter((p) => !perms.includes(p));
  if (removed.length > 0) {
    const { error } = await admin.from("role_permissions").delete().eq("role", role).in("permission", removed);
    if (error) throw new Error(error.message);
  }

  const added = perms.filter((p) => !before.includes(p));
  const detail = [added.length ? `+ ${added.join(", ")}` : null, removed.length ? `− ${removed.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ");
  if (detail) await logActivity(admin, user.id, "role_template_updated", "platform", null, `${role}: ${detail}`);

  revalidatePath("/platform/roles");
}
