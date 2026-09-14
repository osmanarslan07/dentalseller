"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
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
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!myProfile?.is_active) throw new Error("Your account isn't active");

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
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

/** Admin-only. Uses the service-role client (auth.admin.* isn't exposed to RLS-scoped
 * clients), so the admin check has to happen explicitly here — there's no DB trigger to
 * fall back on for this one. */
export async function adminResetPassword(sellerId: string): Promise<AddSellerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (sellerId === user.id) throw new Error("Use 'Change password' in Your account instead");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (myProfile?.role !== "admin") throw new Error("Admin only");

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
