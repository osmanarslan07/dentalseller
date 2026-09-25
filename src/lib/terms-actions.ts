"use server";

import { st } from "@/i18n/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { parseTermsLanguage, TERMS_VERSION } from "@/lib/terms";

/** Records the calling admin's acceptance of the current terms version for their clinic.
 * RLS (terms_acceptances_insert_admin) is the real gate: only an active admin, only as
 * themselves, only for their own clinic — clinic_id is filled in by trigger. */
export async function acceptTerms(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (formData.get("confirm") !== "on") throw new Error(await st("Tick the box to confirm"));
  const language = parseTermsLanguage(String(formData.get("language") ?? ""));

  const { error } = await supabase.from("terms_acceptances").insert({
    user_id: user.id,
    version: TERMS_VERSION,
    language,
  });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "terms_accepted", "clinic", null, `v${TERMS_VERSION} (${language})`);

  redirect("/");
}
