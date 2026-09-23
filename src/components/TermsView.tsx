import Link from "next/link";
import { TERMS, TERMS_EFFECTIVE_DATE, TERMS_VERSION, TermsLanguage } from "@/lib/terms";

/** The terms document itself, with a TR/EN switch — shared by the public /terms page and the
 * admin acceptance page. `basePath` is where the language links point. */
export function TermsView({ language, basePath }: { language: TermsLanguage; basePath: string }) {
  const doc = TERMS[language];
  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{doc.title}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {language === "tr" ? "Sürüm" : "Version"} {TERMS_VERSION} ·{" "}
            {language === "tr" ? "Yürürlük tarihi" : "Effective"} {TERMS_EFFECTIVE_DATE}
          </p>
        </div>
        <nav className="flex rounded-lg bg-slate-100 p-0.5 text-sm" aria-label="Language">
          {(["tr", "en"] as const).map((lang) => (
            <Link
              key={lang}
              href={`${basePath}?lang=${lang}`}
              replace
              scroll={false}
              className={`rounded-md px-3 py-1 font-medium transition ${
                lang === language ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {lang === "tr" ? "Türkçe" : "English"}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-sm text-slate-600">{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">{section.heading}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
