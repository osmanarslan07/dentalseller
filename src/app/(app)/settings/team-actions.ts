"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  revalidatePath("/settings");
  return { email, tempPassword };
}
