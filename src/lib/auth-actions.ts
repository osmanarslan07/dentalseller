"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface AuthState {
  error: string | null;
}

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  redirect(profile?.role === "superadmin" ? "/platform" : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
