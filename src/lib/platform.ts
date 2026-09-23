import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKey } from "@/lib/commission";
import { computeHealthFlags, HealthFlag } from "@/lib/clinic-health";
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

/** Head-only count queries (no rows transferred) — nothing identifying ever leaves the DB,
 * and no risk of PostgREST's default row cap silently truncating a big clinic's numbers. */
async function computeClinicStatsAndHealth(
  clinic: Clinic,
  authById: Map<string, AuthInfo>
): Promise<ClinicWithStats> {
  const clinicId = clinic.id;
  const admin = createAdminClient();
  const { start, end } = currentMonthRange();
  const count = { count: "exact" as const, head: true };

  const [profilesRes, patients, patientsThisMonth, quotes, quotesThisMonth, lastActivity, brandingRes] = await Promise.all([
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
      .select("clinic_address, clinic_phone, clinic_email, clinic_logo_url")
      .eq("clinic_id", clinicId)
      .maybeSingle(),
  ]);
  for (const res of [profilesRes, patients, patientsThisMonth, quotes, quotesThisMonth, lastActivity, brandingRes]) {
    if (res.error) throw res.error;
  }

  const profiles = profilesRes.data ?? [];
  const lastSeenById = await getLastSeenById(profiles.map((p) => p.id));
  const onlineSince = Date.now() - ONLINE_WINDOW_MS;
  const lastActivityAt = lastActivity.data?.created_at ?? null;
  const branding = brandingRes.data;

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
      branding: branding
        ? {
            address: branding.clinic_address ?? "",
            phone: branding.clinic_phone ?? "",
            email: branding.clinic_email ?? "",
            logoUrl: branding.clinic_logo_url,
          }
        : null,
    }),
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

  return Promise.all(((data ?? []) as Clinic[]).map((clinic) => computeClinicStatsAndHealth(clinic, authById)));
}

export async function getClinicWithStats(id: string): Promise<ClinicWithStats | null> {
  const admin = createAdminClient();
  const [{ data, error }, authById] = await Promise.all([
    admin.from("clinics").select(CLINIC_COLUMNS).eq("id", id).maybeSingle(),
    getAuthInfoById(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return computeClinicStatsAndHealth(data as Clinic, authById);
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
