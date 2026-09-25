"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { setLangCookie } from "@/i18n/actions";
import { getT } from "@/i18n/server";
import { isLang } from "@/i18n";

export interface AuthState {
  error: string | null;
}

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // a deactivated member's login is banned (see setSellerActive)
  if (error?.code === "user_banned" || /banned/i.test(error?.message ?? "")) {
    const t = await getT();
    return { error: t("This account has been deactivated. Ask your clinic admin.") };
  }
  if (error) return { error: error.message };

  const { data: profile } = await supabase.from("profiles").select("role, language").eq("id", data.user.id).maybeSingle();
  // this device follows the language saved on the account
  if (isLang(profile?.language)) await setLangCookie(profile.language);
  redirect(profile?.role === "superadmin" ? "/platform" : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
