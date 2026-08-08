import { SupabaseClient } from "@supabase/supabase-js";
import { CommissionSettings, DEFAULT_SETTINGS, Patient } from "@/types";

export async function getPatients(supabase: SupabaseClient): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("confirmation_date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data as Patient[];
}

export async function getPatient(supabase: SupabaseClient, id: string): Promise<Patient | null> {
  const { data, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data as Patient | null;
}

export async function getSettings(supabase: SupabaseClient): Promise<CommissionSettings> {
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();

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
  };
}
