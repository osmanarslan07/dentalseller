import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { ClinicConfig } from "@/types";

/** Market rates come from the ECB via frankfurter.app (no key) and are kept in exchange_rates
 * against EUR — one row per currency per day, written by the daily job or on demand here.
 * Any pair is crossed through EUR. */
const API = "https://api.frankfurter.app";
const OTHERS = SUPPORTED_CURRENCIES.filter((c) => c !== "EUR");

/** How stale a stored rate may be before we ask the API for that exact day (weekends and
 * holidays have no ECB rate, so a few days' gap is normal). */
const MAX_GAP_DAYS = 4;

export type RateSource = "auto" | "clinic" | "manual";

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/** EUR → every supported currency for one day (or the latest), saved to exchange_rates. */
export async function fetchEurRates(date: string | "latest"): Promise<{ date: string; rates: Record<string, number> } | null> {
  try {
    const res = await fetch(`${API}/${date}?from=EUR&to=${OTHERS.join(",")}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.date !== "string" || typeof data?.rates !== "object") return null;
    const rates: Record<string, number> = {};
    for (const c of OTHERS) if (typeof data.rates[c] === "number") rates[c] = data.rates[c];
    const rows = Object.entries(rates).map(([quote, rate]) => ({ base: "EUR", quote, rate, rate_date: data.date }));
    if (rows.length) await createAdminClient().from("exchange_rates").upsert(rows, { onConflict: "base,quote,rate_date" });
    return { date: data.date, rates };
  } catch {
    return null;
  }
}

/** 1 EUR in `currency` on `date` (the last known rate on or before it). */
async function eurRate(currency: string, date: string): Promise<number | null> {
  if (currency === "EUR") return 1;
  const { data } = await createAdminClient()
    .from("exchange_rates")
    .select("rate, rate_date")
    .eq("base", "EUR")
    .eq("quote", currency)
    .lte("rate_date", date)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && daysBetween(data.rate_date, date) <= MAX_GAP_DAYS) return Number(data.rate);
  const fetched = await fetchEurRates(date >= todayIso() ? "latest" : date);
  return fetched?.rates[currency] ?? (data ? Number(data.rate) : null);
}

/** Market rate: 1 `from` = x `to`, on `date` (default today). Null when no rate is known. */
export async function marketRate(from: string, to: string, date: string = todayIso()): Promise<number | null> {
  if (from === to) return 1;
  const day = date > todayIso() ? todayIso() : date;
  const [f, t] = await Promise.all([eurRate(from, day), eurRate(to, day)]);
  return f && t ? t / f : null;
}

/** The rate the clinic uses: its own fixed rate where it set one (defined against the main
 * currency), otherwise the market rate. 1 `from` = `rate` `to`. */
export async function clinicRate(
  config: Pick<ClinicConfig, "mainCurrency" | "fixedRates">,
  from: string,
  to: string,
  date?: string
): Promise<{ rate: number; source: RateSource | null } | null> {
  if (from === to) return { rate: 1, source: null };
  const main = config.mainCurrency;
  let usedFixed = false;
  const toMain = async (c: string): Promise<number | null> => {
    if (c === main) return 1;
    const fixed = config.fixedRates[c];
    if (fixed) {
      usedFixed = true;
      return fixed;
    }
    return marketRate(c, main, date);
  };
  const [f, t] = await Promise.all([toMain(from), toMain(to)]);
  if (!f || !t) return null;
  return { rate: Number((f / t).toFixed(8)), source: usedFixed ? "clinic" : "auto" };
}

/** The latest market rate of every supported currency into `main` (1 unit = x main), for
 * showing next to the currency settings. */
export async function latestMarketRates(main: string): Promise<{ date: string | null; rates: Record<string, number> }> {
  const since = new Date(Date.now() - MAX_GAP_DAYS * 86400000).toISOString().slice(0, 10);
  const { data } = await createAdminClient()
    .from("exchange_rates")
    .select("quote, rate, rate_date")
    .eq("base", "EUR")
    .gte("rate_date", since)
    .order("rate_date", { ascending: false });
  // each currency's own most recent rate (a day's set can be partial)
  let eur: Record<string, number> = { EUR: 1 };
  let date: string | null = null;
  for (const r of data ?? []) {
    if (eur[r.quote] != null) continue;
    eur[r.quote] = Number(r.rate);
    if (!date || r.rate_date < date) date = r.rate_date;
  }
  if (OTHERS.some((c) => eur[c] == null)) {
    const fetched = await fetchEurRates("latest");
    if (!fetched) return { date, rates: {} };
    eur = { EUR: 1, ...fetched.rates };
    date = fetched.date;
  }
  const rates: Record<string, number> = {};
  if (!eur[main]) return { date, rates };
  for (const [c, v] of Object.entries(eur)) if (c !== main) rates[c] = eur[main] / v;
  return { date, rates };
}

/** Daily history of 1 `base` in `quote`, for the rate chart in My settings. */
export async function getRateHistory(base: string, quote: string, days = 90): Promise<{ rate_date: string; rate: number }[]> {
  if (base === quote) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await createAdminClient()
    .from("exchange_rates")
    .select("quote, rate, rate_date")
    .eq("base", "EUR")
    .in("quote", [base, quote].filter((c) => c !== "EUR"))
    .gte("rate_date", since.toISOString().slice(0, 10))
    .order("rate_date", { ascending: true });
  if (error) throw error;
  const byDay = new Map<string, Record<string, number>>();
  for (const r of data ?? []) {
    const day = byDay.get(r.rate_date) ?? { EUR: 1 };
    day[r.quote] = Number(r.rate);
    byDay.set(r.rate_date, day);
  }
  return [...byDay.entries()]
    .filter(([, d]) => d[base] && d[quote])
    .map(([rate_date, d]) => ({ rate_date, rate: d[quote] / d[base] }));
}
