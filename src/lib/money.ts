import { Patient, PatientPayment } from "@/types";
import { formatCurrency } from "@/lib/format";

/** Mirrors public.supported_currencies() in supabase/schema.sql. */
export const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD", "TRY", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  GBP: "British pound",
  EUR: "Euro",
  USD: "US dollar",
  TRY: "Turkish Lira",
  CHF: "Swiss franc",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  DKK: "Danish krone",
  PLN: "Polish Złoty",
  CAD: "Canadian dollar",
  AUD: "Australian dollar",
};

/** "cash payments in British Pounds (£)" — for letters. */
const CURRENCY_PLURALS: Record<CurrencyCode, string> = {
  GBP: "British Pounds",
  EUR: "Euros",
  USD: "US Dollars",
  TRY: "Turkish Lira",
  CHF: "Swiss Francs",
  SEK: "Swedish Kronor",
  NOK: "Norwegian Kroner",
  DKK: "Danish Kroner",
  PLN: "Polish Złoty",
  CAD: "Canadian Dollars",
  AUD: "Australian Dollars",
};

export function currencyInWords(currency: string): string {
  const name = isSupportedCurrency(currency) ? CURRENCY_PLURALS[currency] : currency;
  const symbol = currencySymbol(currency);
  return symbol === currency ? name : `${name} (${symbol})`;
}

export function isSupportedCurrency(c: unknown): c is CurrencyCode {
  return typeof c === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

/** "£", "€", "CHF" — for form labels like "Price (€)". */
export function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((x) => x.type === "currency");
  return part?.value ?? currency;
}

/** The clinic's currencies: `main` for reporting, `deal` = the others it agrees prices in.
 * No others = a single-currency clinic, which never sees a currency picker. */
export interface ClinicCurrencies {
  main: string;
  deal: string[];
}

export function isMultiCurrency(c: ClinicCurrencies): boolean {
  return c.deal.length > 0;
}

/** Every currency a patient's price or a payment can be in: the main one first. */
export function clinicCurrencyList(c: ClinicCurrencies): string[] {
  return [c.main, ...c.deal.filter((x) => x !== c.main)];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A patient's amount (price, extras, owed, paid — all in the deal currency) in the main
 * currency, at the rate agreed with the patient. Exact for a main-currency patient. */
export function dealToMain(p: Pick<Patient, "deal_rate">, amount: number): number {
  return p.deal_rate === 1 ? amount : round2(amount * p.deal_rate);
}

/** Same, keeping null as null. */
export function dealToMainOrNull(p: Pick<Patient, "deal_rate">, amount: number | null): number | null {
  return amount == null ? null : dealToMain(p, amount);
}

/** A payment's card surcharge (kept in the deal currency) in the main currency. */
export function surchargeMain(x: PatientPayment): number {
  if (!x.surcharge_amount) return 0;
  return x.rate_to_deal === x.rate_to_main ? x.surcharge_amount : round2((x.surcharge_amount * x.rate_to_main) / x.rate_to_deal);
}

/** A card surcharge in the currency the payment was handed over in. */
export function surchargePaid(x: PatientPayment): number {
  if (!x.surcharge_amount) return 0;
  return x.rate_to_deal === 1 ? x.surcharge_amount : round2(x.surcharge_amount / x.rate_to_deal);
}

/** Exchange-rate gain (+) or loss (−) on a payment, in the main currency: what it was worth
 * on the day it came in, against what it counts for at the rate the price was agreed at. */
export function paymentFx(p: Pick<Patient, "deal_rate">, x: PatientPayment): number {
  return round2(x.main_amount - dealToMain(p, x.amount));
}

/** "1 € = £0.8561" */
export function rateLabel(from: string, to: string, rate: number): string {
  const digits = rate >= 100 ? 2 : 4;
  return `1 ${currencySymbol(from)} = ${currencySymbol(to)}${rate.toFixed(digits)}`;
}

export const RATE_SOURCE_LABELS: Record<"auto" | "clinic" | "manual", string> = {
  auto: "market rate",
  clinic: "clinic's own rate",
  manual: "set by hand",
};

/** "£2970", "€150.5", "2970 CHF" — a raw amount for Telegram messages and history lines. */
export function plainAmount(amount: number, currency: string): string {
  const symbol = currencySymbol(currency);
  return symbol === currency ? `${amount} ${currency}` : `${symbol}${amount}`;
}

/** "€2,000 · ≈ £1,712" for a non-main amount, just "£1,712" for a main one. */
export function formatWithMain(amount: number, currency: string, main: string, mainValue: number): string {
  if (currency === main) return formatCurrency(amount, currency);
  return `${formatCurrency(amount, currency)} · ≈ ${formatCurrency(mainValue, main)}`;
}
