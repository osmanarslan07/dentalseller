import { ClinicConfig } from "@/types";
import { clinicCurrencyList } from "@/lib/money";
import { clinicRate } from "@/lib/rates";
import { clinicTodayIso } from "@/lib/balance";

export interface DealCurrencyFields {
  currency: string;
  deal_rate: number;
  deal_rate_on: string | null;
  deal_rate_source: "auto" | "clinic" | "manual" | null;
}

/** A patient's deal currency with the rate it's agreed at (into the clinic's main currency),
 * ready to write. The rate is the one on the day the price is agreed — the confirmation date
 * when it's already passed, else today. Server-only: it may fetch a market rate. */
export async function dealCurrencyFields(
  config: ClinicConfig,
  currency: string,
  agreedOn?: string | null
): Promise<DealCurrencyFields> {
  const main = config.mainCurrency;
  if (!clinicCurrencyList({ main, deal: config.dealCurrencies }).includes(currency)) {
    throw new Error(`The clinic doesn't deal in ${currency} — add it in Clinic settings → Money first`);
  }
  if (currency === main) return { currency, deal_rate: 1, deal_rate_on: null, deal_rate_source: null };
  const today = clinicTodayIso();
  const day = agreedOn && agreedOn <= today ? agreedOn : today;
  const r = await clinicRate(config, currency, main, day);
  if (!r) throw new Error(`No exchange rate for ${currency} yet — try again in a moment`);
  return { currency, deal_rate: r.rate, deal_rate_on: day, deal_rate_source: r.source };
}
