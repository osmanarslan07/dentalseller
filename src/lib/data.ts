import { SupabaseClient } from "@supabase/supabase-js";
import { CommissionSettings, DEFAULT_SETTINGS, Patient, Profile, Quote, Task } from "@/types";
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
      .select("*, extra_visits:patient_visits(*)")
      .order("confirmation_date", { ascending: false, nullsFirst: false })
      .order("visit_date", { foreignTable: "patient_visits", ascending: true, nullsFirst: false })
  );

  if (error) throw error;
  return data as Patient[];
}

export async function getPatient(supabase: SupabaseClient, id: string): Promise<Patient | null> {
  const { data, error } = await withRetry(() =>
    supabase.from("patients").select("*, extra_visits:patient_visits(*)").eq("id", id).maybeSingle()
  );

  if (error) throw error;
  return data as Patient | null;
}

/** userId must be explicit: admin can now read every seller's settings row (for the team
 * breakdown view), so relying on RLS + maybeSingle() to mean "just mine" no longer holds. */
export async function getSettings(supabase: SupabaseClient, userId: string): Promise<CommissionSettings> {
  const { data, error } = await withRetry(() =>
    supabase.from("settings").select("*").eq("user_id", userId).maybeSingle()
  );

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

/** Singleton row — clinic-wide settings not tied to any one seller (e.g. the shared Telegram
 * group chat). RLS restricts it to admins, so a non-admin caller just gets null back here. */
export async function getClinicConfig(supabase: SupabaseClient): Promise<{ telegramGroupChatId: string | null }> {
  const { data, error } = await withRetry(() =>
    supabase.from("clinic_config").select("telegram_group_chat_id").eq("id", true).maybeSingle()
  );

  if (error) throw error;
  return { telegramGroupChatId: data?.telegram_group_chat_id ?? null };
}

export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await withRetry(() =>
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
  );

  if (error) throw error;
  return data as Profile | null;
}

export async function getProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await withRetry(() =>
    supabase.from("profiles").select("*").order("created_at", { ascending: true })
  );

  if (error) throw error;
  return data as Profile[];
}

export async function getQuotes(supabase: SupabaseClient): Promise<Quote[]> {
  const { data, error } = await withRetry(() =>
    supabase.from("quotes").select("*").order("created_at", { ascending: false })
  );

  if (error) throw error;
  return data as Quote[];
}

export async function getQuote(supabase: SupabaseClient, id: string): Promise<Quote | null> {
  const { data, error } = await withRetry(() =>
    supabase.from("quotes").select("*").eq("id", id).maybeSingle()
  );

  if (error) throw error;
  return data as Quote | null;
}

export async function getTasks(supabase: SupabaseClient): Promise<Task[]> {
  const { data, error } = await withRetry(() =>
    supabase
      .from("tasks")
      .select("*")
      .order("status", { ascending: true })
      .order("due_date", { ascending: true })
      .order("due_time", { ascending: true, nullsFirst: false })
  );

  if (error) throw error;
  return data as Task[];
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
