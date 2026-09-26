import { getLang } from "@/i18n/server";
import { getAuthClaims } from "@/lib/viewer";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data";
import { hasAcceptedCurrentTerms } from "@/lib/terms-status";
import { parseTermsLanguage, TERMS } from "@/lib/terms";
import { acceptTerms } from "@/lib/terms-actions";
import { TermsView } from "@/components/TermsView";
import { Button } from "@/components/ui";

/** Where a clinic admin lands until their clinic has accepted the current terms version.
 * Outside the (app) layout, whose gate sends admins here — so the gate can't loop. */
export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const supabase = await createClient();
  const user = await getAuthClaims();
  if (!user) redirect("/login");

  const profile = await getMyProfile(supabase, user.id);
  if (profile?.role !== "admin" || !profile.clinic_id) redirect("/");
  if (await hasAcceptedCurrentTerms(supabase)) redirect("/");

  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", profile.clinic_id).maybeSingle();
  const { lang } = await searchParams;
  const language = parseTermsLanguage(lang ?? (await getLang()));
  const doc = TERMS[language];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {language === "tr"
            ? "Devam etmeden önce, kliniğiniz adına güncel hizmet şartlarını kabul etmeniz gerekiyor."
            : "Before continuing, please accept the current terms of service on behalf of your clinic."}
        </p>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-8">
          <TermsView language={language} basePath="/terms/accept" />
          <form action={acceptTerms} className="mt-8 space-y-4 border-t border-slate-100 pt-6">
            <input type="hidden" name="language" value={language} />
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
              {doc.acceptLabel(clinic?.name ?? (language === "tr" ? "kliniğim" : "my clinic"))}
            </label>
            <Button type="submit">{language === "tr" ? "Kabul ediyorum" : "I accept"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
