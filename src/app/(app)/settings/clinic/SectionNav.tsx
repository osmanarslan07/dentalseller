"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { matchesQuery } from "@/lib/search";
import { ClinicSectionId, SETTINGS_INDEX, clinicSectionHref } from "./sections";
import { useT } from "@/i18n/client";

/** The list of Clinic settings sections (vertical on desktop, a strip on phones) and the
 * search box that jumps to the section holding a setting. Only sections the viewer may see
 * are passed in. */
export function SectionNav({ sections }: { sections: { id: ClinicSectionId; label: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const t = useT();
  const visible = new Set(sections.map((s) => s.id));
  const labelOf = (id: ClinicSectionId) => sections.find((s) => s.id === id)?.label ?? "";

  const results = query.trim()
    ? SETTINGS_INDEX.filter((e) => visible.has(e.section) && matchesQuery(query, [e.label, t(e.label), e.words, labelOf(e.section)]))
    : [];

  function go(id: ClinicSectionId) {
    setQuery("");
    router.push(clinicSectionHref(id));
  }

  return (
    <div className="space-y-3 md:w-56 md:flex-none">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              go(results[0].section);
            }
            if (e.key === "Escape") setQuery("");
          }}
          placeholder={t("Search settings…")}
          aria-label={t("Search settings")}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        {query.trim() && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{t("No setting matches “{q}”.", { q: query.trim() })}</li>}
            {results.map((r) => (
              <li key={r.label}>
                <button
                  type="button"
                  onClick={() => go(r.section)}
                  className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-slate-100"
                >
                  <span className="text-sm font-medium text-slate-900">{t(r.label)}</span>
                  <span className="text-xs text-slate-400">{labelOf(r.section)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav aria-label={t("Clinic settings sections")} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {sections.map((s) => {
          const active = pathname === clinicSectionHref(s.id);
          return (
            <Link
              key={s.id}
              href={clinicSectionHref(s.id)}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
