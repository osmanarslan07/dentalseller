import { SupabaseClient } from "@supabase/supabase-js";
import { ClinicConfig, CommissionSettings, DEFAULT_CLINIC_CONFIG, DEFAULT_SETTINGS, MemberRole, Patient, PatientFile, Profile, ProfileRole, Quote, Seller, Task, Transfer, TransferCompany } from "@/types";
import { DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";
import { visitCosts } from "@/lib/commission";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";
import { SavedFilters, parseSavedFilters } from "@/lib/people-filter";

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
  "*, extra_visits:patient_visits(*), extras:patient_extras(*), payments:patient_payments(*), transfer_costs:transfers(visit_number, extra_visit_id, cost)";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Postgres numerics can arrive as strings — make the money fields plain numbers once, here.
 * `deductCosts` is the clinic's "deduct costs before commission" setting: when on, each
 * visit's hotel + external transfer costs are attached for the commission maths. */
export function normalizePatient(row: Record<string, unknown>, deductCosts: boolean): Patient {
  const p = row as unknown as Patient;
  const normalized: Patient = {
    ...p,
    deal_rate: Number(p.deal_rate ?? 1),
    visit1_hotel_cost: num(p.visit1_hotel_cost),
    visit2_hotel_cost: num(p.visit2_hotel_cost),
    transfer_costs: (p.transfer_costs ?? []).map((t) => ({ ...t, cost: num(t.cost) })),
    commission_costs: null,
    extras: (p.extras ?? [])
      .map((e) => ({ ...e, quantity: Number(e.quantity), unit_price: Number(e.unit_price), total: Number(e.total) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    payments: (p.payments ?? [])
      .map((x) => ({
        ...x,
        amount: Number(x.amount),
        paid_amount: Number(x.paid_amount),
        rate_to_deal: Number(x.rate_to_deal),
        rate_to_main: Number(x.rate_to_main),
        main_amount: Number(x.main_amount),
        surcharge_rate: x.surcharge_rate != null ? Number(x.surcharge_rate) : null,
        surcharge_amount: Number(x.surcharge_amount),
      }))
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at)),
    // numerics arrive as strings — every commission sum below relies on these being numbers
    visit1_expected: p.visit1_expected != null ? Number(p.visit1_expected) : null,
    visit1_actual: p.visit1_actual != null ? Number(p.visit1_actual) : null,
    visit2_expected: p.visit2_expected != null ? Number(p.visit2_expected) : null,
    visit2_actual: p.visit2_actual != null ? Number(p.visit2_actual) : null,
    visit1_discount_value: num(p.visit1_discount_value),
    visit2_discount_value: num(p.visit2_discount_value),
    extra_visits: (p.extra_visits ?? []).map((v) => ({
      ...v,
      expected: v.expected != null ? Number(v.expected) : null,
      actual: v.actual != null ? Number(v.actual) : null,
      hotel_cost: num(v.hotel_cost),
      discount_value: num(v.discount_value),
    })),
  };
  if (deductCosts) {
    const costs: Record<string, number> = {};
    for (const key of ["visit1", "visit2", ...normalized.extra_visits.map((v) => v.id)]) {
      const c = visitCosts(normalized, key);
      if (c.hotel + c.transfers > 0) costs[key] = c.hotel + c.transfers;
    }
    normalized.commission_costs = costs;
  }
  return normalized;
}

/** Whether the viewed clinic deducts hotel/transfer costs before commission. */
async function deductsCosts(supabase: SupabaseClient): Promise<boolean> {
  return (await getClinicConfig(supabase)).deductCostsFromCommission;
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
  const deduct = await deductsCosts(supabase);
  return (data ?? []).map((row) => normalizePatient(row, deduct));
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
  return data ? normalizePatient(data, await deductsCosts(supabase)) : null;
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
    approx_currency: data.approx_currency ?? DEFAULT_SETTINGS.approx_currency,
    dashboard_cards:
      Array.isArray(data.dashboard_cards) && data.dashboard_cards.length > 0
        ? data.dashboard_cards
        : DEFAULT_DASHBOARD_CARDS,
  };
}

/** The viewer's saved default Seller / Coordinator filters, per page (step K). */
export async function getSavedFilters(supabase: SupabaseClient, userId: string): Promise<SavedFilters> {
  const { data, error } = await withRetry(() =>
    supabase.from("settings").select("saved_filters").eq("user_id", userId).maybeSingle()
  );
  if (error) throw error;
  return parseSavedFilters(data?.saved_filters);
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
    mainCurrency: data.main_currency ?? DEFAULT_CLINIC_CONFIG.mainCurrency,
    dealCurrencies: Array.isArray(data.deal_currencies) ? data.deal_currencies : [],
    fixedRates: Object.fromEntries(
      Object.entries((data.fixed_rates ?? {}) as Record<string, unknown>)
        .map(([c, r]) => [c, Number(r)] as const)
        .filter(([, r]) => Number.isFinite(r) && r > 0)
    ),
    transferDefaults: {
      airportCompanyId: data.default_airport_company_id ?? null,
      airportDriverId: data.default_airport_driver_id ?? null,
      localCompanyId: data.default_local_company_id ?? null,
      localDriverId: data.default_local_driver_id ?? null,
    },
    driverMessages: {
      mode: data.driver_messages_mode ?? "app",
      phoneNumberId: data.whatsapp_phone_number_id ?? null,
      businessAccountId: data.whatsapp_business_account_id ?? null,
      templateSingle: data.whatsapp_template_single ?? DEFAULT_CLINIC_CONFIG.driverMessages.templateSingle,
      templateDay: data.whatsapp_template_day ?? DEFAULT_CLINIC_CONFIG.driverMessages.templateDay,
      templateLang: data.whatsapp_template_lang ?? DEFAULT_CLINIC_CONFIG.driverMessages.templateLang,
      verifiedAt: data.whatsapp_verified_at ?? null,
      lastError: data.whatsapp_last_error ?? null,
      lastErrorAt: data.whatsapp_last_error_at ?? null,
    },
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

/** A transfer with who it's for — the operations list across all patients. */
export type TransferWithPatient = Transfer & {
  patient: { id: string; name: string; phone: string | null; responsible_seller_id: string; coordinator_id: string | null };
};

/** Every transfer dated from..to (inclusive, YYYY-MM-DD), in pickup order. */
export async function getTransfersInRange(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<TransferWithPatient[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("transfers")
      .select("*, patient:patients(id, name, phone, responsible_seller_id, coordinator_id)")
      .eq("clinic_id", clinicId)
      .gte("transfer_date", from)
      .lte("transfer_date", to)
      .order("transfer_date", { ascending: true })
      .order("transfer_time", { ascending: true, nullsFirst: false })
  );

  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, cost: t.cost != null ? Number(t.cost) : null })) as TransferWithPatient[];
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

/** Everyone who can get credit for a sale — accounts and sellers without one — by name. */
export async function getSellers(supabase: SupabaseClient): Promise<Seller[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("sellers")
      .select("id, name, profile_id, is_active, default_currency, created_at")
      .eq("clinic_id", clinicId)
      .order("name", { ascending: true, nullsFirst: false })
  );

  if (error) throw error;
  return data as Seller[];
}

export type AccountStatus = "active" | "invited" | "inactive";

/** One login of the clinic, as the Users page shows it. */
export interface ClinicAccount {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: ProfileRole;
  roles: MemberRole[];
  isActive: boolean;
  /** Inactive: switched off. Invited: never signed in yet. */
  status: AccountStatus;
  /** The latest of the in-app heartbeat and the last sign-in; null = never. */
  lastActiveAt: string | null;
  createdAt: string;
  clinicId: string | null;
  avatarUpdatedAt: string | null;
}

/** Every account of the viewer's clinic with its email, status and last activity. Only for
 * callers who passed team.view: emails and sign-in times come from the auth service through
 * the service role, looked up one by one for exactly the ids RLS already returned in
 * `profiles` — never a platform-wide list. */
export async function getClinicAccounts(profiles: Profile[]): Promise<ClinicAccount[]> {
  if (profiles.length === 0) return [];
  const admin = createAdminClient();
  const ids = profiles.map((p) => p.id);
  const [users, { data: presence }] = await Promise.all([
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id).then(({ data }) => data.user))),
    admin.from("user_presence").select("user_id, last_seen_at").in("user_id", ids),
  ]);
  const seenById = new Map((presence ?? []).map((r) => [r.user_id as string, r.last_seen_at as string]));

  return profiles.map((p, i) => {
    const user = users[i];
    const lastSignIn = user?.last_sign_in_at ?? null;
    const seen = seenById.get(p.id) ?? null;
    const lastActiveAt =
      [seen, lastSignIn].filter((d): d is string => !!d).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
    return {
      id: p.id,
      displayName: p.display_name,
      email: user?.email ?? null,
      phone: p.phone ?? null,
      role: p.role,
      roles: p.roles ?? [],
      isActive: p.is_active,
      status: !p.is_active ? "inactive" : lastSignIn ? "active" : "invited",
      lastActiveAt,
      createdAt: p.created_at,
      clinicId: p.clinic_id,
      avatarUpdatedAt: p.avatar_updated_at ?? null,
    };
  });
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

/** The two numbers the menu shows on Tasks and Transfers. Best-effort: a badge is never
 * worth breaking the page over, so a failed count is just 0. Tasks are counted overdue by
 * date (the time of day is ignored); transfers are the planned ones from today on that
 * haven't been sent yet. */
export async function getNavBadges(
  supabase: SupabaseClient,
  wants: { tasks: boolean; transfers: boolean },
  todayIso: string
): Promise<{ tasks: number; transfers: number }> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return { tasks: 0, transfers: 0 };
  const owner = await ownerFilter();
  const [tasks, transfers] = await Promise.all([
    wants.tasks
      ? withRetry(() => {
          let q = supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId)
            .eq("status", "pending")
            .lt("due_date", todayIso);
          if (owner) q = q.eq("user_id", owner);
          return q;
        })
      : null,
    wants.transfers
      ? withRetry(() =>
          supabase
            .from("transfers")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId)
            .eq("status", "planned")
            .gte("transfer_date", todayIso)
        )
      : null,
  ]);
  return { tasks: tasks?.count ?? 0, transfers: transfers?.count ?? 0 };
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

/** A patient's files, newest first. */
export async function getPatientFiles(supabase: SupabaseClient, patientId: string): Promise<PatientFile[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() =>
    supabase
      .from("patient_files")
      .select("id, patient_id, name, path, size, mime, uploaded_by, created_at")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
  );
  if (error) throw error;
  return ((data ?? []) as PatientFile[]).map((f) => ({ ...f, size: Number(f.size) }));
}
