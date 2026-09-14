"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface NameState {
  error: string | null;
}

export async function setMyDisplayName(_prevState: NameState, formData: FormData): Promise<NameState> {
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

  redirect("/");
}

/** Settings-page version: updates in place, no redirect (the welcome flow uses setMyDisplayName instead). */
export async function updateDisplayName(name: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Please enter your name");
  if (trimmed.length > 60) throw new Error("Name must be 60 characters or fewer");

  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

/** Re-authenticates with the current password before allowing the change, so a left-open
 * session alone isn't enough to take over the account. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
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
}
