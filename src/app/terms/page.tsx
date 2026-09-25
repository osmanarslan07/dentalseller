import { getLang } from "@/i18n/server";
import Link from "next/link";
import { parseTermsLanguage } from "@/lib/terms";
import { TermsView } from "@/components/TermsView";

export const metadata = { title: "Terms · DentalSeller" };

/** Public — readable without signing in (see the middleware's public routes). */
export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const language = parseTermsLanguage(lang ?? (await getLang()));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 font-semibold text-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-8 w-8" />
          DentalSeller
        </Link>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-8">
          <TermsView language={language} basePath="/terms" />
        </div>
      </div>
    </div>
  );
}
