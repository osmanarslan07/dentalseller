"use client";

import { createContext, useContext, ReactNode } from "react";
import { ClinicCurrencies, clinicCurrencyList, isMultiCurrency } from "@/lib/money";

const CurrencyContext = createContext<ClinicCurrencies>({ main: "GBP", deal: [] });

/** The clinic's main currency and the others it deals in, for every client component. */
export function CurrencyProvider({ currencies, children }: { currencies: ClinicCurrencies; children: ReactNode }) {
  return <CurrencyContext.Provider value={currencies}>{children}</CurrencyContext.Provider>;
}

export function useCurrencies() {
  const c = useContext(CurrencyContext);
  return { ...c, multi: isMultiCurrency(c), list: clinicCurrencyList(c) };
}
