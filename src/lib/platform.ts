import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKey, monthLabel } from "@/lib/commission";
import { computeHealthFlags, HealthFlag } from "@/lib/clinic-health";
import { computeOnboarding, OnboardingStep } from "@/lib/clinic-onboarding";
import { ClinicBilling, Plan } from "@/lib/clinic-billing";
import { Announcement, AnnouncementLevel } from "@/lib/announcements";
import { JobDefinition, JobHealth, jobHealth, JOBS } from "@/lib/jobs";
import { getEnvChatsClinicId } from "@/lib/telegram";
import { ProfileRole } from "@/types";

export type MfaState = "verified" | "needs_setup" | "needs_code";

/** Where the superadmin's session stands on two-factor. aal2 = this session passed the
 * authenticator-code step; nextLevel aal2 with currentLevel aal1 = a factor is enrolled but
 * not used yet this session; nextLevel aal1 = nothing enrolled. */
async function getMfaState(supabase: Awaited<ReturnType<typeof createClient>>): Promise<MfaState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "needs_code";
  if (data.currentLevel === "aal2") return "verified";
  return data.nextLevel === "aal2" ? "needs_code" : "needs_setup";
}

/** Signed-in superadmin, whether or not the second factor is done yet — only for the /mfa
 * page itself. Everything else goes through requireSuperadmin / assertSuperadmin. */
export async function getSuperadminForMfa() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "superadmin") redirect("/");

  return { user, mfa: await getMfaState(supabase) };
}

/** Server-side gate for every /platform page and action. Platform reads go through the
 * service-role client (a superadmin has no RLS access to clinic data — deliberately), so
 * this check is the only thing standing between a caller and every clinic's numbers —
 * which is why it also demands the second factor: a stolen password alone gets nowhere. */
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

  if ((await getMfaState(supabase)) !== "verified") redirect("/mfa");

  return { supabase, user, displayName: (profile.display_name as string | null) ?? null };
}

/** Same check for server actions — throws instead of redirecting, so the calling form can
 * show the error. Actions can be invoked directly, so the second-factor check matters here
 * just as much as on the pages. */
export async function assertSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "superadmin") throw new Error("Superadmin only");

  if ((await getMfaState(supabase)) !== "verified") throw new Error("Two-factor verification required");

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

export interface PlatformPerson extends ClinicMember {
  clinicId: string | null;
  clinicName: string | null;
  clinicActive: boolean;
}

/** Every account on the platform — staff identities only (name, email, role, clinic,
 * presence), never anything from a clinic's records. For the People search page. */
export async function getAllPeople(): Promise<PlatformPerson[]> {
  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: clinics, error: cError }] = await Promise.all([
    admin.from("profiles").select("id, display_name, role, is_active, created_at, clinic_id"),
    admin.from("clinics").select("id, name, is_active"),
  ]);
  if (error) throw error;
  if (cError) throw cError;

  const rows = profiles ?? [];
  const members = await toMembers(rows);
  const clinicById = new Map((clinics ?? []).map((c) => [c.id as string, c]));
  const clinicIdByPerson = new Map(rows.map((p) => [p.id, p.clinic_id as string | null]));

  return members
    .map((m) => {
      const clinicId = clinicIdByPerson.get(m.id) ?? null;
      const clinic = clinicId ? clinicById.get(clinicId) : undefined;
      return {
        ...m,
        clinicId,
        clinicName: clinic?.name ?? null,
        clinicActive: clinic?.is_active ?? true,
      };
    })
    .sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
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
  announcement_created: "Posted announcement",
  announcement_ended: "Ended announcement",
  announcement_deleted: "Deleted announcement",
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
    } else if (r.target_type === "announcement") {
      targetLabel = "Announcement";
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

/** Every announcement, newest first (live, scheduled and ended) — the platform's full view.
 * The clinic app reads the same table through RLS, which only returns what's live for it. */
export async function getAnnouncements(): Promise<Announcement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, message, level, clinic_ids, starts_at, ends_at, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id))];
  const { data: creators } = creatorIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", creatorIds)
    : { data: [] };
  const authById = creatorIds.length ? await getAuthInfoById() : new Map<string, AuthInfo>();
  const nameOf = (id: string) =>
    (creators ?? []).find((c) => c.id === id)?.display_name || authById.get(id)?.email || null;

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    level: r.level as AnnouncementLevel,
    clinicIds: r.clinic_ids,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdAt: r.created_at,
    createdByName: r.created_by ? nameOf(r.created_by) : null,
  }));
}

/** [id, name] for every clinic, sorted by name — for pickers. */
export async function getClinicNames(): Promise<[string, string][]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clinics").select("id, name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => [c.id, c.name]);
}

export interface JobRun {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  statusCode: number | null;
  summary: string | null;
  error: string | null;
}

export interface JobStatus extends JobDefinition {
  health: JobHealth;
  lastRun: JobRun | null;
  lastSuccessAt: string | null;
  /** Newest first, most recent 10. */
  recentRuns: JobRun[];
}

export interface TelegramStatus {
  tokenConfigured: boolean;
  /** getMe succeeded — the token is valid and the bot exists. */
  botOk: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  pendingUpdates: number | null;
  lastWebhookErrorAt: string | null;
  lastWebhookError: string | null;
  webhookSecretConfigured: boolean;
  fallbackChatConfigured: boolean;
  /** The one clinic the env chats (TELEGRAM_CHAT_ID / TELEGRAM_GROUP_CHAT_ID) go to. */
  envChatsClinicName: string | null;
  error: string | null;
}

const RECENT_RUNS = 10;

async function getJobStatuses(): Promise<JobStatus[]> {
  const admin = createAdminClient();
  return Promise.all(
    JOBS.map(async (job) => {
      const [recent, lastSuccess] = await Promise.all([
        admin
          .from("job_runs")
          .select("started_at, finished_at, ok, status_code, summary, error")
          .eq("job", job.id)
          .order("started_at", { ascending: false })
          .limit(RECENT_RUNS),
        admin
          .from("job_runs")
          .select("started_at")
          .eq("job", job.id)
          .eq("ok", true)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (recent.error) throw recent.error;
      if (lastSuccess.error) throw lastSuccess.error;

      const recentRuns: JobRun[] = (recent.data ?? []).map((r) => ({
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        ok: r.ok,
        statusCode: r.status_code,
        summary: r.summary,
        error: r.error,
      }));
      const lastRun = recentRuns[0] ?? null;
      const lastSuccessAt = lastSuccess.data?.started_at ?? null;
      return { ...job, health: jobHealth(job, lastRun, lastSuccessAt), lastRun, lastSuccessAt, recentRuns };
    })
  );
}

async function getEnvChatsClinicName(): Promise<string | null> {
  const id = await getEnvChatsClinicId();
  if (!id) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("clinics").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}

/** Live checks against the Bot API. The token itself never leaves the server. */
async function getTelegramStatus(): Promise<TelegramStatus> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base: TelegramStatus = {
    tokenConfigured: !!token,
    botOk: false,
    botUsername: null,
    webhookUrl: null,
    pendingUpdates: null,
    lastWebhookErrorAt: null,
    lastWebhookError: null,
    webhookSecretConfigured: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    fallbackChatConfigured: !!process.env.TELEGRAM_CHAT_ID,
    envChatsClinicName: await getEnvChatsClinicName(),
    error: null,
  };
  if (!token) return base;

  try {
    const call = async (method: string) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
      return json.result;
    };
    const [me, hook] = await Promise.all([call("getMe"), call("getWebhookInfo")]);
    return {
      ...base,
      botOk: true,
      botUsername: me.username ?? null,
      webhookUrl: hook.url || null,
      pendingUpdates: typeof hook.pending_update_count === "number" ? hook.pending_update_count : null,
      lastWebhookErrorAt: hook.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
      lastWebhookError: hook.last_error_message ?? null,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getSystemStatus(): Promise<{ jobs: JobStatus[]; telegram: TelegramStatus }> {
  const [jobs, telegram] = await Promise.all([getJobStatuses(), getTelegramStatus()]);
  return { jobs, telegram };
}

/** Count of problems for the Overview's one-line system indicator. */
export function countSystemProblems(status: { jobs: JobStatus[]; telegram: TelegramStatus }): number {
  const jobProblems = status.jobs.filter((j) => j.health !== "ok").length;
  const t = status.telegram;
  const telegramProblem = !t.tokenConfigured || !t.botOk || !t.webhookUrl || (t.pendingUpdates ?? 0) > 20;
  return jobProblems + (telegramProblem ? 1 : 0);
}
