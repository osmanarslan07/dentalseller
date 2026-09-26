import { SupabaseClient } from "@supabase/supabase-js";
import { ClinicConfig, CommissionSettings, DEFAULT_CLINIC_CONFIG, DEFAULT_SETTINGS, MemberRole, Patient, PatientFile, PatientRoster, Profile, ProfileRole, Quote, Seller, Task, Transfer, TransferCompany } from "@/types";
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

/** The API returns at most this many rows per request (Supabase's max_rows) and says nothing
 * when it cuts a list off there. */
const PAGE_ROWS = 1000;

/** Every row of a query, read page by page past the API's row cap. `page` builds the same
 * query for rows from..to; it must have a stable order (end it on a unique column). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await withRetry(() => page(from, from + PAGE_ROWS - 1));
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

/** Splits a long id list so an `in (...)` filter keeps the request URL short. */
function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

const ROSTER_SELECT = "*, extra_visits:patient_visits(*)";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids go into PostgREST filter strings (`or=(...)`), so only ever a real uuid. */
function uuidOnly(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("Invalid id");
  return id;
}

function patientsQuery(supabase: SupabaseClient, clinicId: string, select: string) {
  return supabase.from("patients").select(select).eq("clinic_id", clinicId);
}
type PatientsQuery = ReturnType<typeof patientsQuery>;

/** Every matching patient row of the clinic, newest confirmation first, past the row cap. */
function fetchPatientRows(
  supabase: SupabaseClient,
  clinicId: string,
  select: string,
  filter: (q: PatientsQuery) => PatientsQuery = (q) => q
): Promise<Record<string, unknown>[]> {
  return fetchAll((from, to) =>
    filter(patientsQuery(supabase, clinicId, select))
      .order("confirmation_date", { ascending: false, nullsFirst: false })
      .order("id")
      .order("visit_date", { foreignTable: "patient_visits", ascending: true, nullsFirst: false })
      .range(from, to)
  ) as unknown as Promise<Record<string, unknown>[]>;
}

/** Patients with at least one extra visit matching `filter` — extra visits live in their own
 * table, so a patient-level `or` can't see them. */
function extraVisitsQuery(supabase: SupabaseClient, clinicId: string) {
  return supabase.from("patient_visits").select("id, patient_id").eq("clinic_id", clinicId);
}

async function patientIdsWithExtraVisit(
  supabase: SupabaseClient,
  clinicId: string,
  filter: (q: ReturnType<typeof extraVisitsQuery>) => ReturnType<typeof extraVisitsQuery>
): Promise<string[]> {
  const rows = await fetchAll((from, to) => filter(extraVisitsQuery(supabase, clinicId)).order("id").range(from, to));
  return [...new Set((rows as { patient_id: string }[]).map((r) => r.patient_id))];
}

/** `rows` plus the patients in `ids` it doesn't have yet, in the same newest-first order. */
async function withPatients(
  supabase: SupabaseClient,
  clinicId: string,
  select: string,
  rows: Record<string, unknown>[],
  ids: string[],
  filter: (q: PatientsQuery) => PatientsQuery = (q) => q
): Promise<Record<string, unknown>[]> {
  const have = new Set(rows.map((r) => r.id as string));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length === 0) return rows;
  const more = (
    await Promise.all(chunks(missing).map((part) => fetchPatientRows(supabase, clinicId, select, (q) => filter(q.in("id", part)))))
  ).flat();
  const byNewest = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const ad = (a.confirmation_date as string | null) ?? "", bd = (b.confirmation_date as string | null) ?? "";
    if (ad !== bd) return !ad ? 1 : !bd ? -1 : bd.localeCompare(ad);
    return (a.id as string).localeCompare(b.id as string);
  };
  return [...rows, ...more].sort(byNewest);
}

/** Which patients to load. Without a scope it's the whole clinic — megabytes of data per
 * request once a clinic has a few thousand patients, so pages should scope it. */
export interface PatientScope {
  /** Everyone whose visits can count for this seller's commission: they're responsible for
   * the patient, or earned one of its visits (a visit's credit owner is its earner, else the
   * responsible seller — see patientVisits in lib/commission). Exactly the patients that
   * seller's commission maths reads. */
  creditedTo?: string;
  /** Just these patients. */
  ids?: string[];
  /** Patients with visit 1, visit 2 or an extra visit dated from..to (to exclusive) — every
   * patient a month's commission totals read (computeMonthTotals keys visits by their date). */
  visitIn?: DateRange;
}

/** YYYY-MM-DD from, to exclusive. */
export interface DateRange {
  from: string;
  to: string;
}

function checkRange({ from, to }: DateRange): DateRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Invalid date");
  return { from, to };
}
const within = ({ from, to }: DateRange, col: string) => `and(${col}.gte.${from},${col}.lt.${to})`;

export async function getPatients(supabase: SupabaseClient, scope: PatientScope = {}): Promise<Patient[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  let rows: Record<string, unknown>[];
  if (scope.ids) {
    rows = await withPatients(supabase, clinicId, PATIENT_SELECT, [], scope.ids.filter((id) => UUID_RE.test(id)));
  } else if (scope.visitIn) {
    const range = checkRange(scope.visitIn);
    const [direct, viaExtraVisits] = await Promise.all([
      fetchPatientRows(supabase, clinicId, PATIENT_SELECT, (q) =>
        q.or([within(range, "visit1_date"), within(range, "visit2_date")].join(","))
      ),
      patientIdsWithExtraVisit(supabase, clinicId, (q) => q.gte("visit_date", range.from).lt("visit_date", range.to)),
    ]);
    rows = await withPatients(supabase, clinicId, PATIENT_SELECT, direct, viaExtraVisits);
  } else if (scope.creditedTo) {
    const s = uuidOnly(scope.creditedTo);
    const [direct, viaExtraVisits] = await Promise.all([
      fetchPatientRows(supabase, clinicId, PATIENT_SELECT, (q) =>
        q.or(`responsible_seller_id.eq.${s},visit1_earned_by_seller_id.eq.${s},visit2_earned_by_seller_id.eq.${s}`)
      ),
      patientIdsWithExtraVisit(supabase, clinicId, (q) => q.eq("earned_by_seller_id", s)),
    ]);
    rows = await withPatients(supabase, clinicId, PATIENT_SELECT, direct, viaExtraVisits);
  } else {
    rows = await fetchPatientRows(supabase, clinicId, PATIENT_SELECT);
  }
  const deduct = await deductsCosts(supabase);
  return rows.map((row) => normalizePatient(row, deduct));
}

function toRoster(row: Record<string, unknown>): PatientRoster {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { extras, payments, transfer_costs, commission_costs, ...roster } = normalizePatient(row, false);
  return roster;
}

/** Patients for lists and people pages, without money detail. Filters combine with AND. */
export interface RosterScope {
  responsible?: string;
  coordinator?: string;
  /** Coordinated patients with a visit still to come, or with any visit, arrival or extra visit
   * dated in the range — every patient the coordinator workload can count. */
  coordinatedActive?: DateRange;
  /** Patients with any calendar event in the range: visit, arrival or departure of visit 1 or
   * 2, or an extra visit (see flattenCalendarEvents). */
  eventsIn?: DateRange;
}

export async function getPatientRoster(supabase: SupabaseClient, scope: RosterScope): Promise<PatientRoster[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const filter = (q: PatientsQuery): PatientsQuery => {
    if (scope.responsible) q = q.eq("responsible_seller_id", scope.responsible);
    if (scope.coordinator) q = q.eq("coordinator_id", scope.coordinator);
    if (scope.coordinatedActive) q = q.not("coordinator_id", "is", null);
    return q;
  };
  let rows: Record<string, unknown>[];
  if (scope.coordinatedActive || scope.eventsIn) {
    const range = checkRange((scope.coordinatedActive ?? scope.eventsIn)!);
    const conditions = scope.coordinatedActive
      ? [
          "visit1_status.eq.upcoming",
          "and(needs_visit2.is.true,visit2_status.eq.upcoming)",
          ...["visit1_arrival_date", "visit1_date", "visit2_arrival_date", "visit2_date"].map((c) => within(range, c)),
        ]
      : ["visit1_arrival_date", "visit1_departure_date", "visit1_date", "visit2_arrival_date", "visit2_departure_date", "visit2_date"].map(
          (c) => within(range, c)
        );
    const extraVisitFilter = scope.coordinatedActive ? `status.eq.upcoming,${within(range, "visit_date")}` : within(range, "visit_date");
    const [direct, viaExtraVisits] = await Promise.all([
      fetchPatientRows(supabase, clinicId, ROSTER_SELECT, (q) => filter(q).or(conditions.join(","))),
      patientIdsWithExtraVisit(supabase, clinicId, (q) => q.or(extraVisitFilter)),
    ]);
    rows = await withPatients(supabase, clinicId, ROSTER_SELECT, direct, viaExtraVisits, filter);
  } else {
    rows = await fetchPatientRows(supabase, clinicId, ROSTER_SELECT, filter);
  }
  return rows.map(toRoster);
}

/** How many of the clinic's patients match — without loading them. */
export async function countPatients(
  supabase: SupabaseClient,
  filter: { responsible?: string; withoutCoordinator?: boolean; confirmedIn?: DateRange } = {}
): Promise<number> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return 0;
  const { count, error } = await withRetry(() => {
    let q = supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
    if (filter.responsible) q = q.eq("responsible_seller_id", filter.responsible);
    if (filter.withoutCoordinator) q = q.is("coordinator_id", null);
    if (filter.confirmedIn) {
      const r = checkRange(filter.confirmedIn);
      q = q.gte("confirmation_date", r.from).lt("confirmation_date", r.to);
    }
    return q;
  });
  if (error) throw error;
  return count ?? 0;
}

/** Per responsible seller: all their patients, and those confirmed in `confirmedIn` — one query
 * for a whole team (sellers without patients are simply absent). */
export async function getPatientCountsBySeller(
  supabase: SupabaseClient,
  confirmedIn: DateRange
): Promise<Map<string, { total: number; confirmed: number }>> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return new Map();
  const r = checkRange(confirmedIn);
  const { data, error } = await withRetry(() =>
    supabase.rpc("patient_counts_by_seller", { p_clinic: clinicId, p_from: r.from, p_to: r.to })
  );
  if (error) throw error;
  return new Map(
    Object.entries((data ?? {}) as Record<string, [number, number]>).map(([id, [total, confirmed]]) => [id, { total: Number(total), confirmed: Number(confirmed) }])
  );
}

/** Every seller responsible for at least one of the clinic's patients. */
export async function getSellerIdsWithPatients(supabase: SupabaseClient): Promise<Set<string>> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return new Set();
  const { data, error } = await withRetry(() => supabase.rpc("patient_seller_ids", { p_clinic: clinicId }));
  if (error) throw error;
  return new Set(((data ?? []) as string[]).filter(Boolean));
}

/** Months (YYYY-MM, newest first) with at least one payment. */
export async function getPaymentMonths(supabase: SupabaseClient): Promise<string[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() => supabase.rpc("payment_months", { p_clinic: clinicId }));
  if (error) throw error;
  return (data ?? []) as string[];
}

/** Patients with a payment dated in the range. */
export async function getPatientIdsPaidIn(supabase: SupabaseClient, range: DateRange): Promise<string[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const r = checkRange(range);
  const rows = await fetchAll((from, to) =>
    supabase
      .from("patient_payments")
      .select("id, patient_id")
      .eq("clinic_id", clinicId)
      .gte("paid_on", r.from)
      .lt("paid_on", r.to)
      .order("id")
      .range(from, to)
  );
  return [...new Set((rows as { patient_id: string }[]).map((x) => x.patient_id))];
}

/** Patients whose balances may not add up — a superset for lib/balance's own rules to narrow
 * (see patient_open_balance_ids in schema.sql). */
export async function getOpenBalanceCandidateIds(supabase: SupabaseClient): Promise<string[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const { data, error } = await withRetry(() => supabase.rpc("patient_open_balance_ids", { p_clinic: clinicId }));
  if (error) throw error;
  // an array, not rows: a set of rows would be cut off at the API's 1,000-row cap
  return ((data as string[] | null) ?? []).filter(Boolean);
}

/** Whether any payment was made in a currency other than `main`, or toward a price agreed in
 * one — the payments ledger only has exchange-rate columns to show then. */
export async function hasForeignMoney(supabase: SupabaseClient, main: string): Promise<boolean> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return false;
  const [patients, payments] = await Promise.all([
    withRetry(() =>
      supabase
        .from("patient_payments")
        .select("id, patient:patients!inner(currency)")
        .eq("clinic_id", clinicId)
        .neq("patient.currency", main)
        .limit(1)
    ),
    withRetry(() => supabase.from("patient_payments").select("id").eq("clinic_id", clinicId).neq("currency", main).limit(1)),
  ]);
  if (patients.error) throw patients.error;
  if (payments.error) throw payments.error;
  return (patients.data?.length ?? 0) > 0 || (payments.data?.length ?? 0) > 0;
}

/** Names of just these patients (activity entries, task labels), by id. */
export async function getPatientNames(supabase: SupabaseClient, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const clinicId = await getMyClinicId();
  const wanted = [...new Set([...ids].filter((id): id is string => !!id && UUID_RE.test(id)))];
  if (!clinicId || wanted.length === 0) return new Map();
  const parts = await Promise.all(
    chunks(wanted).map(async (part) => {
      const { data, error } = await withRetry(() =>
        supabase.from("patients").select("id, name").eq("clinic_id", clinicId).in("id", part)
      );
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    })
  );
  return new Map(parts.flat().map((p) => [p.id, p.name]));
}

export interface PatientOption {
  id: string;
  name: string;
}

/** Patients whose name contains `query`, for type-to-search pickers. */
export async function searchPatientNames(supabase: SupabaseClient, query: string, limit = 20): Promise<PatientOption[]> {
  const clinicId = await getMyClinicId();
  const q = query.trim().slice(0, 80);
  if (!clinicId || !q) return [];
  // % and _ are wildcards in ILIKE; the user means them literally
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await withRetry(() =>
    supabase.from("patients").select("id, name").eq("clinic_id", clinicId).ilike("name", pattern).order("name").limit(limit)
  );
  if (error) throw error;
  return (data ?? []) as PatientOption[];
}

/** Hotel names and room types already used in the clinic, for autocomplete. */
export async function getStayOptions(supabase: SupabaseClient): Promise<{ hotels: string[]; roomTypes: string[] }> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return { hotels: [], roomTypes: [] };
  const { data, error } = await withRetry(() => supabase.rpc("patient_stay_options", { p_clinic: clinicId }).maybeSingle());
  if (error) throw error;
  const row = data as { hotels: string[] | null; room_types: string[] | null } | null;
  return { hotels: row?.hotels ?? [], roomTypes: row?.room_types ?? [] };
}

/** Everyone coordinating at least one patient of the clinic. */
export async function getCoordinatingIds(supabase: SupabaseClient): Promise<Set<string>> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return new Set();
  const { data, error } = await withRetry(() => supabase.rpc("patient_coordinator_ids", { p_clinic: clinicId }));
  if (error) throw error;
  return new Set(((data ?? []) as string[]).filter(Boolean));
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
  const data = await fetchAll((start, end) =>
    supabase
      .from("transfers")
      .select("*, patient:patients(id, name, phone, responsible_seller_id, coordinator_id)")
      .eq("clinic_id", clinicId)
      .gte("transfer_date", from)
      .lte("transfer_date", to)
      .order("transfer_date", { ascending: true })
      .order("transfer_time", { ascending: true, nullsFirst: false })
      .order("id")
      .range(start, end)
  );
  return data.map((t) => ({ ...t, cost: t.cost != null ? Number(t.cost) : null })) as TransferWithPatient[];
}

export type UpcomingTransfer = Pick<Transfer, "status"> & {
  transfer_date: string; // the query only returns dated transfers

  patient: Pick<Patient, "responsible_seller_id" | "coordinator_id">;
};

/** Just the dates and statuses of every transfer from today on — enough for the Transfers
 * page to point at the days still to send, and the next day with anything on it. */
export async function getUpcomingTransfers(supabase: SupabaseClient, todayIso: string): Promise<UpcomingTransfer[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const data = await fetchAll((from, to) =>
    supabase
      .from("transfers")
      .select("transfer_date, status, patient:patients(responsible_seller_id, coordinator_id)")
      .eq("clinic_id", clinicId)
      .gte("transfer_date", todayIso)
      .order("transfer_date", { ascending: true })
      .order("id")
      .range(from, to)
  );
  return data as unknown as UpcomingTransfer[];
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
  const data = await fetchAll((from, to) => {
    let q = supabase.from("quotes").select("*").eq("clinic_id", clinicId);
    if (owner) q = q.eq("user_id", owner);
    return q.order("created_at", { ascending: false }).order("id").range(from, to);
  });
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
 * date (the time of day is ignored); transfers are the ones in the coming week (today and
 * the six days after) that haven't been sent yet — later ones aren't urgent, and the
 * Transfers page still lists them in its "Not sent yet" bar. */
export async function getNavBadges(
  supabase: SupabaseClient,
  wants: { tasks: boolean; transfers: boolean },
  todayIso: string
): Promise<{ tasks: number; transfers: number }> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return { tasks: 0, transfers: 0 };
  const owner = await ownerFilter();
  const [y, m, d] = todayIso.split("-").map(Number);
  const weekEnd = new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
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
            .lte("transfer_date", weekEnd)
        )
      : null,
  ]);
  return { tasks: tasks?.count ?? 0, transfers: transfers?.count ?? 0 };
}

export async function getTasks(supabase: SupabaseClient): Promise<Task[]> {
  const clinicId = await getMyClinicId();
  if (!clinicId) return [];
  const owner = await ownerFilter();
  const data = await fetchAll((from, to) => {
    let q = supabase.from("tasks").select("*").eq("clinic_id", clinicId);
    if (owner) q = q.eq("user_id", owner);
    return q
      .order("status", { ascending: true })
      .order("due_date", { ascending: true })
      .order("due_time", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to);
  });
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
