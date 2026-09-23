import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKey, monthLabel } from "@/lib/commission";
import { computeHealthFlags, HealthFlag } from "@/lib/clinic-health";
import { computeOnboarding, OnboardingStep } from "@/lib/clinic-onboarding";
import { ClinicBilling, Plan } from "@/lib/clinic-billing";
import { ProfileRole } from "@/types";

/** Server-side gate for every /platform page and action. Platform reads go through the
 * service-role client (a superadmin has no RLS access to clinic data — deliberately), so
 * this check is the only thing standing between a caller and every clinic's numbers. */
export async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "superadmin") redirect("/");

  return { supabase, user, displayName: (profile.display_name as string | null) ?? null };
}

/** Same check for server actions — throws instead of redirecting, so the calling form can
 * show the error. */
export async function assertSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "superadmin") throw new Error("Superadmin only");

  return { supabase, user };
}

export interface Clinic {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  created_at: string;
}

/** Aggregates only — the platform area never sees a patient's name, treatment or money.
 * Everything below is a count or a timestamp. */
export interface ClinicStats {
  admins: number;
  sellers: number;
  activeUsers: number;
  patients: number;
  patientsConfirmedThisMonth: number;
  quotes: number;
  quotesThisMonth: number;
  lastActivityAt: string | null;
  onlineNow: number;
}

export interface ClinicWithStats extends Clinic {
  stats: ClinicStats;
  /** Worst first; empty when the clinic is healthy (or suspended). */
  health: HealthFlag[];
  onboarding: OnboardingStep[];
  /** Null until a superadmin records a plan. */
  billing: ClinicBilling | null;
}

export interface ClinicMember {
  id: string;
  displayName: string | null;
  email: string | null;
  role: ProfileRole;
  isActive: boolean;
  createdAt: string;
  /** From the in-app heartbeat (user_presence) — null until they've used the app since it shipped. */
  lastSeenAt: string | null;
  /** Supabase's own record of their last login — the fallback for accounts with no presence yet. */
  lastSignInAt: string | null;
}

/** Keep in step with ONLINE_WINDOW_MS in components/LastSeen.tsx. */
const ONLINE_WINDOW_MS = 5 * 60_000;

interface AuthInfo {
  email: string | null;
  lastSignInAt: string | null;
}

async function getAuthInfoById(): Promise<Map<string, AuthInfo>> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return new Map(data.users.map((u) => [u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null }]));
}

async function getLastSeenById(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data, error } = await admin.from("user_presence").select("user_id, last_seen_at").in("user_id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.user_id, r.last_seen_at]));
}

/** First day of this month and of next, as ISO dates — bounds for "this month" counts. */
function currentMonthRange(): { start: string; end: string } {
  const [year, month] = currentMonthKey().split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  return { start: `${year}-${pad(month)}-01`, end: `${next}-01` };
}

/** Stats, health flags and onboarding for one clinic. Head-only count queries (no rows
 * transferred) — nothing identifying ever leaves the DB, and no risk of PostgREST's default
 * row cap silently truncating a big clinic's numbers. */
async function summarizeClinic(
  clinic: Clinic,
  authById: Map<string, AuthInfo>
): Promise<ClinicWithStats> {
  const clinicId = clinic.id;
  const admin = createAdminClient();
  const { start, end } = currentMonthRange();
  const count = { count: "exact" as const, head: true };

  const [
    profilesRes,
    patients,
    patientsThisMonth,
    quotes,
    quotesThisMonth,
    lastActivity,
    brandingRes,
    confirmedPatients,
    billingRes,
  ] =
    await Promise.all([
      admin.from("profiles").select("id, role, is_active").eq("clinic_id", clinicId),
      admin.from("patients").select("id", count).eq("clinic_id", clinicId),
      admin
        .from("patients")
        .select("id", count)
        .eq("clinic_id", clinicId)
        .gte("confirmation_date", start)
        .lt("confirmation_date", end),
      admin.from("quotes").select("id", count).eq("clinic_id", clinicId),
      admin.from("quotes").select("id", count).eq("clinic_id", clinicId).gte("created_at", start).lt("created_at", end),
      admin
        .from("activity_log")
        .select("created_at")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("clinic_config")
        .select("clinic_address, clinic_phone, clinic_email, clinic_logo_url, telegram_group_chat_id")
        .eq("clinic_id", clinicId)
        .maybeSingle(),
      admin.from("patients").select("id", count).eq("clinic_id", clinicId).not("confirmation_date", "is", null),
      admin
        .from("clinic_billing")
        .select("plan, seat_limit, trial_ends_at, monthly_price, currency, notes")
        .eq("clinic_id", clinicId)
        .maybeSingle(),
    ]);
  const results = [
    profilesRes,
    patients,
    patientsThisMonth,
    quotes,
    quotesThisMonth,
    lastActivity,
    brandingRes,
    confirmedPatients,
    billingRes,
  ];
  for (const res of results) {
    if (res.error) throw res.error;
  }

  const profiles = profilesRes.data ?? [];
  const lastSeenById = await getLastSeenById(profiles.map((p) => p.id));
  const onlineSince = Date.now() - ONLINE_WINDOW_MS;
  const lastActivityAt = lastActivity.data?.created_at ?? null;
  const branding = brandingRes.data;
  const brandingInput = branding
    ? {
        address: branding.clinic_address ?? "",
        phone: branding.clinic_phone ?? "",
        email: branding.clinic_email ?? "",
        logoUrl: branding.clinic_logo_url,
      }
    : null;
  const billing = toClinicBilling(billingRes.data);

  return {
    ...clinic,
    stats: {
      admins: profiles.filter((p) => p.role === "admin").length,
      sellers: profiles.filter((p) => p.role === "seller").length,
      activeUsers: profiles.filter((p) => p.is_active).length,
      patients: patients.count ?? 0,
      patientsConfirmedThisMonth: patientsThisMonth.count ?? 0,
      quotes: quotes.count ?? 0,
      quotesThisMonth: quotesThisMonth.count ?? 0,
      lastActivityAt,
      onlineNow: [...lastSeenById.values()].filter((t) => new Date(t).getTime() > onlineSince).length,
    },
    health: computeHealthFlags({
      isActive: clinic.is_active,
      createdAt: clinic.created_at,
      lastActivityAt,
      members: profiles.map((p) => ({
        role: p.role,
        isActive: p.is_active,
        lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
      })),
      branding: brandingInput,
      billing,
    }),
    billing,
    onboarding: computeOnboarding({
      branding: brandingInput && { ...brandingInput, telegramGroupChatId: branding?.telegram_group_chat_id ?? null },
      sellers: profiles.filter((p) => p.role === "seller").length,
      quotes: quotes.count ?? 0,
      confirmedPatients: confirmedPatients.count ?? 0,
    }),
  };
}

interface ClinicBillingRow {
  plan: Plan;
  seat_limit: number | null;
  trial_ends_at: string | null;
  monthly_price: string | number | null;
  currency: string;
  notes: string | null;
}

function toClinicBilling(row: ClinicBillingRow | null): ClinicBilling | null {
  if (!row) return null;
  return {
    plan: row.plan,
    seatLimit: row.seat_limit,
    trialEndsAt: row.trial_ends_at,
    // numeric can arrive as a string or a number depending on the driver path — normalize
    monthlyPrice: row.monthly_price === null ? null : Number(row.monthly_price),
    currency: row.currency,
    notes: row.notes,
  };
}

const CLINIC_COLUMNS = "id, name, slug, is_active, created_at";

export async function getClinicsWithStats(): Promise<ClinicWithStats[]> {
  const admin = createAdminClient();
  const [{ data, error }, authById] = await Promise.all([
    admin.from("clinics").select(CLINIC_COLUMNS).order("created_at", { ascending: true }),
    getAuthInfoById(),
  ]);
  if (error) throw error;

  return Promise.all(((data ?? []) as Clinic[]).map((clinic) => summarizeClinic(clinic, authById)));
}

export async function getClinicWithStats(id: string): Promise<ClinicWithStats | null> {
  const admin = createAdminClient();
  const [{ data, error }, authById] = await Promise.all([
    admin.from("clinics").select(CLINIC_COLUMNS).eq("id", id).maybeSingle(),
    getAuthInfoById(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return summarizeClinic(data as Clinic, authById);
}

interface MemberProfileRow {
  id: string;
  display_name: string | null;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
}

async function toMembers(rows: MemberProfileRow[]): Promise<ClinicMember[]> {
  const [authById, lastSeenById] = await Promise.all([getAuthInfoById(), getLastSeenById(rows.map((p) => p.id))]);
  return rows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    email: authById.get(p.id)?.email ?? null,
    role: p.role,
    isActive: p.is_active,
    createdAt: p.created_at,
    lastSeenAt: lastSeenById.get(p.id) ?? null,
    lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
  }));
}

export async function getClinicMembers(clinicId: string): Promise<ClinicMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, role, is_active, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return toMembers(data ?? []);
}

export async function getSuperadmins(): Promise<ClinicMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, role, is_active, created_at")
    .eq("role", "superadmin")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return toMembers(data ?? []);
}

export interface MonthlyUsage {
  /** "2026-09" */
  month: string;
  /** "Sept" — axis tick */
  short: string;
  /** "Sept 2026" — tooltip / table */
  label: string;
  quotesCreated: number;
  patientsConfirmed: number;
  activeUsers: number;
}

interface MonthlyUsageRow {
  clinic_id: string;
  month: string;
  quotes_created: number;
  patients_confirmed: number;
  active_users: number;
}

const MIN_TREND_MONTHS = 6;

function shortMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

/** Last 12 months of counts, for one clinic or summed across the whole platform (a user
 * belongs to exactly one clinic, so summing active users across clinics doesn't double
 * count). Leading all-zero months are trimmed so a young platform doesn't show a row of
 * empty bars, but at least 6 months are always kept for context. */
export async function getMonthlyUsage(clinicId?: string): Promise<MonthlyUsage[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("platform_monthly_usage", { p_months: 12 });
  if (error) throw error;

  const byMonth = new Map<string, MonthlyUsage>();
  for (const row of (data ?? []) as MonthlyUsageRow[]) {
    if (clinicId && row.clinic_id !== clinicId) continue;
    const month = row.month.slice(0, 7);
    const acc = byMonth.get(month) ?? {
      month,
      short: shortMonthLabel(month),
      label: monthLabel(month),
      quotesCreated: 0,
      patientsConfirmed: 0,
      activeUsers: 0,
    };
    acc.quotesCreated += row.quotes_created;
    acc.patientsConfirmed += row.patients_confirmed;
    acc.activeUsers += row.active_users;
    byMonth.set(month, acc);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const firstUsed = months.findIndex((m) => m.quotesCreated + m.patientsConfirmed + m.activeUsers > 0);
  const latestStart = months.length - MIN_TREND_MONTHS;
  const start = firstUsed === -1 ? latestStart : Math.min(firstUsed, latestStart);
  return months.slice(Math.max(start, 0));
}

/** Every action a superadmin can take from the platform area, as logged by actions.ts. */
export const PLATFORM_ACTION_LABELS: Record<string, string> = {
  clinic_created: "Created clinic",
  clinic_updated: "Edited clinic details",
  clinic_suspended: "Suspended clinic",
  clinic_reactivated: "Reactivated clinic",
  password_reset: "Reset password",
  superadmin_added: "Added superadmin",
  clinic_billing_updated: "Updated plan",
};

export const AUDIT_LOG_LIMIT = 200;

export interface PlatformAuditEntry {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  actorName: string;
  /** Who or what was acted on — a clinic, or a person (with their clinic, if any). */
  targetLabel: string;
  /** The clinic involved, directly or via the person acted on — drives the clinic filter
   * and the link. Null for platform-level targets like a new superadmin. */
  clinicId: string | null;
  clinicName: string | null;
  detail: string | null;
}

/** Actions taken by superadmins, newest first. Read with the service role — clinic staff's
 * own activity_log rows (which can name patients) are never included, only rows whose
 * actor is a superadmin. */
export async function getPlatformAuditLog(): Promise<{
  entries: PlatformAuditEntry[];
  /** Every clinic as [id, name], sorted by name — for the clinic filter. */
  clinics: [string, string][];
}> {
  const admin = createAdminClient();
  const { data: superadmins, error: saError } = await admin.from("profiles").select("id").eq("role", "superadmin");
  if (saError) throw saError;
  const superadminIds = (superadmins ?? []).map((s) => s.id);

  const { data: rows, error } = await admin
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at")
    .in("actor_id", superadminIds)
    .order("created_at", { ascending: false })
    .limit(AUDIT_LOG_LIMIT);
  if (error) throw error;
  const entries = rows ?? [];

  const profileTargetIds = entries.filter((r) => r.target_type === "profile" && r.target_id).map((r) => r.target_id);
  const peopleIds = [...new Set([...superadminIds, ...profileTargetIds])];

  const [{ data: clinics, error: cError }, { data: people, error: pError }, authById] = await Promise.all([
    admin.from("clinics").select("id, name"),
    admin.from("profiles").select("id, display_name, clinic_id").in("id", peopleIds),
    getAuthInfoById(),
  ]);
  if (cError) throw cError;
  if (pError) throw pError;

  const clinicName = new Map((clinics ?? []).map((c) => [c.id, c.name as string]));
  const clinicList = [...clinicName].sort((a, b) => a[1].localeCompare(b[1]));
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  // A deleted account keeps its log rows — label it rather than dropping the entry.
  const nameOf = (id: string) => person.get(id)?.display_name || authById.get(id)?.email || "Deleted account";

  const auditEntries = entries.map((r): PlatformAuditEntry => {
    let targetLabel = "—";
    let clinicId: string | null = null;
    if (r.target_type === "clinic" && r.target_id) {
      clinicId = r.target_id;
      targetLabel = clinicName.get(r.target_id) ?? "Deleted clinic";
    } else if (r.target_type === "profile" && r.target_id) {
      clinicId = person.get(r.target_id)?.clinic_id ?? null;
      const email = authById.get(r.target_id)?.email;
      targetLabel = email ?? nameOf(r.target_id);
    }
    return {
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      actionLabel: PLATFORM_ACTION_LABELS[r.action] ?? r.action,
      actorName: r.actor_id ? nameOf(r.actor_id) : "Unknown",
      targetLabel,
      clinicId,
      clinicName: clinicId ? (clinicName.get(clinicId) ?? null) : null,
      detail: r.detail,
    };
  });

  return { entries: auditEntries, clinics: clinicList };
}
