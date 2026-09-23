import { SupabaseClient } from "@supabase/supabase-js";
import { ClinicConfig, CommissionSettings, DEFAULT_CLINIC_CONFIG, DEFAULT_SETTINGS, Patient, Profile, ProfileRole, Quote, Task, Transfer, TransferCompany } from "@/types";
import { DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

/** Cold-start Supabase reads occasionally flake with a network error; one retry clears it. */
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    return fn();
  }
}

/** The clinic being viewed — the caller's own, or the supported clinic in support mode —
 * used as an explicit filter on every clinic-scoped read below. RLS is the real boundary;
 * this is defense in depth, so a policy regression can't silently widen what a page shows.
 * No clinic context (signed out, unassigned) means these reads return nothing. */
async function getMyClinicId(): Promise<string | null> {
  return (await getViewer())?.clinicId ?? null;
}

/** A patient with everything hanging off their visits that money or operations reads. */
const PATIENT_SELECT =
  "*, extra_visits:patient_visits(*), extras:patient_extras(*), payments:patient_payments(*)";

/** Postgres numerics can arrive as strings — make the money fields plain numbers once, here. */
function normalizePatient(row: Record<string, unknown>): Patient {
  const p = row as unknown as Patient;
  return {
    ...p,
    extras: (p.extras ?? [])
      .map((e) => ({ ...e, quantity: Number(e.quantity), unit_price: Number(e.unit_price), total: Number(e.total) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    payments: (p.payments ?? [])
      .map((x) => ({
        ...x,
        amount: Number(x.amount),
        surcharge_rate: x.surcharge_rate != null ? Number(x.surcharge_rate) : null,
        surcharge_amount: Number(x.surcharge_amount),
      }))
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at)),
    // numerics arrive as strings — every commission sum below relies on these being numbers
    visit1_expected: p.visit1_expected != null ? Number(p.visit1_expected) : null,
    visit1_actual: p.visit1_actual != null ? Number(p.visit1_actual) : null,
    visit2_expected: p.visit2_expected != null ? Number(p.visit2_expected) : null,
    visit2_actual: p.visit2_actual != null ? Number(p.visit2_actual) : null,
    extra_visits: (p.extra_visits ?? []).map((v) => ({
      ...v,
      expected: v.expected != null ? Number(v.expected) : null,
      actual: v.actual != null ? Number(v.actual) : null,
    })),
  };
}

export async function getPatients(supabase: SupabaseClient): Promise<Patient[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("patients")
      .select(PATIENT_SELECT)
      .eq("clinic_id", clinicId)
      .order("confirmation_date", { ascending: false, nullsFirst: false })
      .order("visit_date", { foreignTable: "patient_visits", ascending: true, nullsFirst: false })
  );

  if (error) throw error;
  return (data ?? []).map(normalizePatient);
}

export async function getPatient(supabase: SupabaseClient, id: string): Promise<Patient | null> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return null;
  const { data, error } = await withRetry(() =>
    supabase
      .from("patients")
      .select(PATIENT_SELECT)
      .eq("id", id)
      .eq("clinic_id", clinicId)
      .maybeSingle()
  );

  if (error) throw error;
  return data ? normalizePatient(data) : null;
}

/** userId must be explicit: admin can now read every seller's settings row (for the team
 * breakdown view), so relying on RLS + maybeSingle() to mean "just mine" no longer holds. */
export async function getSettings(supabase: SupabaseClient, userId: string): Promise<CommissionSettings> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return DEFAULT_SETTINGS;
  const { data, error } = await withRetry(() =>
    supabase.from("settings").select("*").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle()
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
    celebration_sound: Boolean(data.celebration_sound ?? true),
    show_try: Boolean(data.show_try),
    currency: data.currency,
    dashboard_cards:
      Array.isArray(data.dashboard_cards) && data.dashboard_cards.length > 0
        ? data.dashboard_cards
        : DEFAULT_DASHBOARD_CARDS,
  };
}

/** One row per clinic — clinic-wide settings not tied to any one seller (the shared Telegram
 * group chat, confirmation-letter/quote-offer branding). Readable by any active seller of that
 * clinic; only its admins can write it (see the clinic_config RLS policies). */
export async function getClinicConfig(supabase: SupabaseClient): Promise<ClinicConfig> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return DEFAULT_CLINIC_CONFIG;
  const { data, error } = await withRetry(() =>
    supabase.from("clinic_config").select("*").eq("clinic_id", clinicId).maybeSingle()
  );

  if (error) throw error;
  if (!data) return DEFAULT_CLINIC_CONFIG;

  return {
    telegramGroupChatId: data.telegram_group_chat_id ?? null,
    clinicName: data.clinic_name ?? DEFAULT_CLINIC_CONFIG.clinicName,
    clinicShortName: data.clinic_short_name ?? DEFAULT_CLINIC_CONFIG.clinicShortName,
    clinicAddress: data.clinic_address ?? DEFAULT_CLINIC_CONFIG.clinicAddress,
    clinicPhone: data.clinic_phone ?? DEFAULT_CLINIC_CONFIG.clinicPhone,
    clinicEmail: data.clinic_email ?? DEFAULT_CLINIC_CONFIG.clinicEmail,
    clinicLogoUrl: data.clinic_logo_url ?? null,
    deductCostsFromCommission: data.deduct_costs_from_commission ?? false,
    cardSurchargeRate: data.card_surcharge_rate != null ? Number(data.card_surcharge_rate) : DEFAULT_CLINIC_CONFIG.cardSurchargeRate,
  };
}

/** Internal company first, then external ones by name; drivers by name within each. */
export async function getTransferCompanies(supabase: SupabaseClient): Promise<TransferCompany[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("transfer_companies")
      .select("*, drivers(*)")
      .eq("clinic_id", clinicId)
      .order("is_internal", { ascending: false })
      .order("name", { ascending: true })
      .order("name", { foreignTable: "drivers", ascending: true })
  );

  if (error) throw error;
  return data as TransferCompany[];
}

/** One patient's transfers across all visits, in the order they happen. */
export async function getPatientTransfers(supabase: SupabaseClient, patientId: string): Promise<Transfer[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("transfers")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("transfer_date", { ascending: true, nullsFirst: false })
      .order("transfer_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
  );

  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, cost: t.cost != null ? Number(t.cost) : null })) as Transfer[];
}

export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await withRetry(() =>
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
  );

  if (error) throw error;
  return data as Profile | null;
}

export async function getProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase.from("profiles").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: true })
  );

  if (error) throw error;
  return data as Profile[];
}

export interface TeamMember {
  id: string;
  displayName: string | null;
  role: ProfileRole;
  isActive: boolean;
  /** Only ever populated for an admin caller — sellers must never see a colleague's email,
   * registered or still-invited. */
  email: string | null;
}

/** Admin sees everyone (registered or still-invited, with email — the only way to tell who an
 * invited row even is, since `display_name` stays null until first login). A seller sees only
 * registered colleagues, names only, no invited/pending rows and never an email. */
export async function getTeamMembers(profiles: Profile[], isAdmin: boolean): Promise<TeamMember[]> {
  if (!isAdmin) {
    return profiles
      .filter((p) => p.display_name)
      .map((p) => ({ id: p.id, displayName: p.display_name, role: p.role, isActive: p.is_active, email: null }));
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const emailById = new Map(data.users.map((u) => [u.id, u.email ?? null]));

  return profiles.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    role: p.role,
    isActive: p.is_active,
    email: emailById.get(p.id) ?? null,
  }));
}

/** Quotes and tasks are private per seller. RLS already returns only the caller's own —
 * except for support, which can read the whole clinic's so it can help anyone; there the
 * list is narrowed to the member being viewed as, so the page shows exactly their view. */
async function ownerFilter(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer?.support ? viewer.userId : null;
}

export async function getQuotes(supabase: SupabaseClient): Promise<Quote[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const owner = await ownerFilter();
  const { data, error } = await withRetry(() => {
    let q = supabase.from("quotes").select("*").eq("clinic_id", clinicId);
    if (owner) q = q.eq("user_id", owner);
    return q.order("created_at", { ascending: false });
  });

  if (error) throw error;
  return data as Quote[];
}

export async function getQuote(supabase: SupabaseClient, id: string): Promise<Quote | null> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return null;
  const { data, error } = await withRetry(() =>
    supabase.from("quotes").select("*").eq("id", id).eq("clinic_id", clinicId).maybeSingle()
  );

  if (error) throw error;
  return data as Quote | null;
}

export async function getTasks(supabase: SupabaseClient): Promise<Task[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const owner = await ownerFilter();
  const { data, error } = await withRetry(() => {
    let q = supabase.from("tasks").select("*").eq("clinic_id", clinicId);
    if (owner) q = q.eq("user_id", owner);
    return q
      .order("status", { ascending: true })
      .order("due_date", { ascending: true })
      .order("due_time", { ascending: true, nullsFirst: false });
  });

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
