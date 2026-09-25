"use client";

import { useTransition } from "react";
import { LANGS } from "@/i18n";
import { useLang, useT } from "@/i18n/client";
import { setLanguage } from "@/i18n/actions";

/** EN | TR — saved on the account and applied to this browser straight away. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("Language")} className={`inline-flex rounded-lg bg-slate-100 p-0.5 ${pending ? "opacity-60" : ""} ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          disabled={pending}
          aria-pressed={lang === l.id}
          title={l.label}
          onClick={() => lang !== l.id && start(() => setLanguage(l.id))}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${
            lang === l.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {l.id}
        </button>
      ))}
    </div>
  );
}
