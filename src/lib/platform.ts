import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKey } from "@/lib/commission";
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
}

export interface ClinicWithStats extends Clinic {
  stats: ClinicStats;
}

export interface ClinicMember {
  id: string;
  displayName: string | null;
  email: string | null;
  role: ProfileRole;
  isActive: boolean;
  createdAt: string;
}

async function getEmailById(): Promise<Map<string, string | null>> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return new Map(data.users.map((u) => [u.id, u.email ?? null]));
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
async function computeClinicStats(clinicId: string): Promise<ClinicStats> {
  const admin = createAdminClient();
  const { start, end } = currentMonthRange();
  const count = { count: "exact" as const, head: true };

  const [profilesRes, patients, patientsThisMonth, quotes, quotesThisMonth, lastActivity] = await Promise.all([
    admin.from("profiles").select("role, is_active").eq("clinic_id", clinicId),
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
  ]);
  for (const res of [profilesRes, patients, patientsThisMonth, quotes, quotesThisMonth, lastActivity]) {
    if (res.error) throw res.error;
  }

  const profiles = profilesRes.data ?? [];
  return {
    admins: profiles.filter((p) => p.role === "admin").length,
    sellers: profiles.filter((p) => p.role === "seller").length,
    activeUsers: profiles.filter((p) => p.is_active).length,
    patients: patients.count ?? 0,
    patientsConfirmedThisMonth: patientsThisMonth.count ?? 0,
    quotes: quotes.count ?? 0,
    quotesThisMonth: quotesThisMonth.count ?? 0,
    lastActivityAt: lastActivity.data?.created_at ?? null,
  };
}

export async function getClinicsWithStats(): Promise<ClinicWithStats[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clinics")
    .select("id, name, slug, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const clinics = (data ?? []) as Clinic[];
  return Promise.all(clinics.map(async (clinic) => ({ ...clinic, stats: await computeClinicStats(clinic.id) })));
}

export async function getClinicWithStats(id: string): Promise<ClinicWithStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clinics")
    .select("id, name, slug, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as Clinic), stats: await computeClinicStats(id) };
}

export async function getClinicMembers(clinicId: string): Promise<ClinicMember[]> {
  const admin = createAdminClient();
  const [{ data, error }, emailById] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, role, is_active, created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true }),
    getEmailById(),
  ]);
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    email: emailById.get(p.id) ?? null,
    role: p.role,
    isActive: p.is_active,
    createdAt: p.created_at,
  }));
}

export async function getSuperadmins(): Promise<ClinicMember[]> {
  const admin = createAdminClient();
  const [{ data, error }, emailById] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, role, is_active, created_at")
      .eq("role", "superadmin")
      .order("created_at", { ascending: true }),
    getEmailById(),
  ]);
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    email: emailById.get(p.id) ?? null,
    role: p.role,
    isActive: p.is_active,
    createdAt: p.created_at,
  }));
}
