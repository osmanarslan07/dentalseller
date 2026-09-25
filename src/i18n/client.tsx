"use client";

import { createContext, ReactNode, useContext, useMemo } from "react";
import { dateFnsLocaleOf, Lang, localeOf, makeT, T } from "./index";

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}

/** "en-GB" / "tr-TR", for toLocaleDateString. */
export function useLocale(): string {
  return localeOf(useLang());
}

/** date-fns locale for format(…, { locale }). */
export function useDateFnsLocale() {
  return dateFnsLocaleOf(useLang());
}
