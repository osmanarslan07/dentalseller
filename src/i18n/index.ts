import { tr as trDateLocale } from "date-fns/locale/tr";
import { TR } from "./tr";

/**
 * Translation, gettext-style: the English text is the key. Code says t("Save"); the Turkish
 * dictionary maps "Save" → "Kaydet". Anything without a Turkish entry simply shows in English,
 * so a missing translation never breaks a page. `node scripts/i18n-missing.mjs` lists the gaps.
 *
 * Placeholders: t("Visit {n}", { n: 2 }). English plurals are picked in code
 * (n === 1 ? t("1 patient") : t("{n} patients", { n })) — Turkish doesn't pluralize after a number.
 */
export type Lang = "en" | "tr";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "tr", label: "Türkçe" },
];
export const LANG_COOKIE = "lang";

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "tr";
}

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

export function makeT(lang: Lang): T {
  if (lang === "tr") return (text, vars) => fill(TR[text] ?? text, vars);
  return (text, vars) => fill(text, vars);
}

/** Marks English text defined outside a component (menus, option lists) so the gap checker
 * finds it; it's translated where it's shown, with t(label). */
export const msg = (text: string) => text;

/** For toLocaleDateString / Intl. */
export function localeOf(lang: Lang): string {
  return lang === "tr" ? "tr-TR" : "en-GB";
}

/** For date-fns format(…, { locale }). undefined = date-fns' English default. */
export function dateFnsLocaleOf(lang: Lang) {
  return lang === "tr" ? trDateLocale : undefined;
}
