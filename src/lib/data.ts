import { SupabaseClient } from "@supabase/supabase-js";
import { CommissionSettings, DEFAULT_SETTINGS, Patient } from "@/types";
import { DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";

/** Cold-start Supabase reads occasionally flake with a network error; one retry clears it. */
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    return fn();
  }
}

export async function getPatients(supabase: SupabaseClient): Promise<Patient[]> {
  const { data, error } = await withRetry(() =>
    supabase
      .from("patients")
      .select("*")
      .order("confirmation_date", { ascending: false, nullsFirst: false })
  );

  if (error) throw error;
  return data as Patient[];
}

export async function getPatient(supabase: SupabaseClient, id: string): Promise<Patient | null> {
  const { data, error } = await withRetry(() =>
    supabase.from("patients").select("*").eq("id", id).maybeSingle()
  );

  if (error) throw error;
  return data as Patient | null;
}

export async function getSettings(supabase: SupabaseClient): Promise<CommissionSettings> {
  const { data, error } = await withRetry(() => supabase.from("settings").select("*").maybeSingle());

  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;

  return {
    tier1_threshold: Number(data.tier1_threshold),
    tier1_rate: Number(data.tier1_rate),
    tier2_threshold: Number(data.tier2_threshold),
    tier2_rate: Number(data.tier2_rate),
    tier3_rate: Number(data.tier3_rate),
    fixed_monthly_payment: Number(data.fixed_monthly_payment),
    hide_earnings: Boolean(data.hide_earnings),
    show_try: Boolean(data.show_try),
    currency: data.currency,
    dashboard_cards:
      Array.isArray(data.dashboard_cards) && data.dashboard_cards.length > 0
        ? data.dashboard_cards
        : DEFAULT_DASHBOARD_CARDS,
    clinic_name: data.clinic_name ?? DEFAULT_SETTINGS.clinic_name,
    clinic_short_name: data.clinic_short_name ?? DEFAULT_SETTINGS.clinic_short_name,
    clinic_address: data.clinic_address ?? DEFAULT_SETTINGS.clinic_address,
    clinic_phone: data.clinic_phone ?? DEFAULT_SETTINGS.clinic_phone,
    clinic_email: data.clinic_email ?? DEFAULT_SETTINGS.clinic_email,
    clinic_logo_url: data.clinic_logo_url ?? null,
  };
}

export interface ExchangeRatePoint {
  rate_date: string;
  rate: number;
}

export async function getRateHistory(
  supabase: SupabaseClient,
  base: string,
  days = 90
): Promise<ExchangeRatePoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate_date, rate")
    .eq("base", base)
    .eq("quote", "TRY")
    .gte("rate_date", since.toISOString().slice(0, 10))
    .order("rate_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((d) => ({ rate_date: d.rate_date, rate: Number(d.rate) }));
}
