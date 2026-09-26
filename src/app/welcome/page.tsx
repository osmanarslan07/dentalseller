import { redirect } from "next/navigation";
import { getAuthClaims } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data";
import { WelcomeForm } from "./WelcomeForm";
import { getT } from "@/i18n/server";
import { LanguageSwitch } from "@/components/LanguageSwitch";

export default async function WelcomePage() {
  const supabase = await createClient();
  const user = await getAuthClaims();
  if (!user) redirect("/login");

  const profile = await getMyProfile(supabase, user.id);
  if (profile?.display_name) redirect("/");
  const t = await getT();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DentalSeller" className="mx-auto mb-4 h-18 w-18" />
          <h1 className="text-xl font-semibold text-slate-900">{t("Welcome to DentalSeller")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("What should we call you? Other sellers will see this name.")}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <WelcomeForm />
        </div>
        <div className="mt-6 flex justify-center">
          <LanguageSwitch />
        </div>
      </div>
    </div>
  );
}
