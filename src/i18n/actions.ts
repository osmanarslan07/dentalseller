"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLang, LANG_COOKIE, Lang } from "./index";

const YEAR = 60 * 60 * 24 * 365;

export async function setLangCookie(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

/** Switch the interface language: saved on the account (so every device follows at sign-in)
 * and in this browser's cookie (which is what pages read). */
export async function setLanguage(lang: string) {
  if (!isLang(lang)) throw new Error("Unknown language");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase.from("profiles").update({ language: lang }).eq("id", user.id);
    if (error) throw new Error(error.message);
  }
  await setLangCookie(lang);
  revalidatePath("/", "layout");
}
