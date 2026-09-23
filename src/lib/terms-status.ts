import { SupabaseClient } from "@supabase/supabase-js";
import { TERMS_VERSION } from "@/lib/terms";

/** Whether the caller's clinic has accepted the current terms version. Any of the clinic's
 * admins accepting counts for the whole clinic. RLS scopes the read to the caller's clinic
 * (and to admins — a seller always reads nothing, which is fine: only admins are asked). */
export async function hasAcceptedCurrentTerms(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("id")
    .eq("version", TERMS_VERSION)
    .limit(1);
  if (error) {
    // Best-effort gate: never lock a clinic out of its own app over a failed check.
    console.error("Terms acceptance check failed:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}
