"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { assertNotSupportMode } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, AVATAR_TYPES, avatarPath } from "@/lib/avatars";

export interface NameState {
  error: string | null;
}

export async function setMyDisplayName(_prevState: NameState, formData: FormData): Promise<NameState> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { error: "Please enter your name" };
  if (name.length > 60) return { error: "Name must be 60 characters or fewer" };

  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, "display_name_updated", "profile", user.id, `— → ${name} (first sign-in)`);

  redirect("/");
}

/** Settings-page version: updates in place, no redirect (the welcome flow uses setMyDisplayName instead). */
export async function updateDisplayName(name: string): Promise<void> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Please enter your name");
  if (trimmed.length > 60) throw new Error("Name must be 60 characters or fewer");

  const { data: before } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.id,
    "display_name_updated",
    "profile",
    user.id,
    `${before?.display_name ?? "—"} → ${trimmed}`
  );

  revalidatePath("/", "layout");
}

/** Re-authenticates with the current password before allowing the change, so a left-open
 * session alone isn't enough to take over the account. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");
  if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) throw new Error("Current password is incorrect");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "password_changed", "profile", user.id);
}

/** Your phone, in international format (it is how WhatsApp messages will reach you). Empty
 * clears it. */
export async function updateMyPhone(rawPhone: string): Promise<string | null> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const phone = normalizePhone(rawPhone);
  const { data: before } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();

  const { error } = await supabase.from("profiles").update({ phone }).eq("id", user.id);
  if (error) {
    if (error.code === "23505") throw new Error("Someone else in your clinic already has that phone number");
    throw new Error(error.message);
  }

  if ((before?.phone ?? null) !== phone) {
    await logActivity(supabase, user.id, "phone_updated", "profile", user.id, `${before?.phone || "—"} → ${phone || "—"}`);
  }
  revalidatePath("/profile");
  revalidatePath("/users", "layout");
  return phone;
}

/** Changing your sign-in email is confirmed with your current password (the app sends no
 * email of its own yet), then applied at once through the service role — the same address
 * is what you sign in with from then on. */
export async function changeMyEmail(currentPassword: string, rawEmail: string): Promise<string> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");

  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (email === user.email.toLowerCase()) throw new Error("That is already your email");
  // the change below uses the service role; RLS hides a deactivated account's own row
  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!me) throw new Error("Your account isn't active");

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (reauthError) throw new Error("Current password is incorrect");

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) throw new Error("Another account already uses that email");
    throw new Error(error.message);
  }

  await logActivity(supabase, user.id, "email_changed", "profile", user.id, `${user.email} → ${email}`);
  revalidatePath("/", "layout");
  return email;
}

/** Your photo. The browser shrinks it first; the file always goes to your own fixed path,
 * and the storage policies accept nothing else. */
export async function uploadMyAvatar(formData: FormData): Promise<void> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a photo");
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image");
  if (file.size > AVATAR_MAX_BYTES) throw new Error("That photo is too large");

  const { data: me } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!me?.clinic_id) throw new Error("Your account isn't linked to a clinic");

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(avatarPath(me.clinic_id, user.id), file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("profiles").update({ avatar_updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "avatar_updated", "profile", user.id);
  revalidatePath("/", "layout");
}

export async function removeMyAvatar(): Promise<void> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: me } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!me?.clinic_id) throw new Error("Your account isn't linked to a clinic");

  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(me.clinic_id, user.id)]);
  if (removeError) throw new Error(removeError.message);
  const { error } = await supabase.from("profiles").update({ avatar_updated_at: null }).eq("id", user.id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "avatar_removed", "profile", user.id);
  revalidatePath("/", "layout");
}
