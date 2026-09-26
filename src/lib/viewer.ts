import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClinicModule, MemberRole, Permission, SellerRole } from "@/types";

export interface SupportContext {
  sessionId: string;
  clinicName: string;
  viewAsName: string | null;
  expiresAt: string;
  /** Editing is unlocked until this time; null or past = view only. */
  editingUntil: string | null;
  canWrite: boolean;
  /** Everyone in the clinic, for the "view as" switcher. */
  members: { id: string; name: string; role: SellerRole; roles: MemberRole[] }[];
}

/** Who the clinic app is being rendered for. For a clinic member: themselves. For a
 * superadmin in support mode: the member they're viewing as — so every "my …" page shows
 * exactly what that person sees — while `authUserId` stays the superadmin's own id, which
 * is what activity/audit entries record (and what RLS actually checks). */
export interface Viewer {
  /** The signed-in account — the real actor. */
  authUserId: string;
  email: string;
  /** Whose "me" the app renders: the signed-in member, or the member support is viewing as. */
  userId: string;
  displayName: string | null;
  /** The old single role (admin or not) of whoever is being rendered for. */
  role: SellerRole;
  roles: MemberRole[];
  /** What the viewer may do — from the database, which also applies support mode (the
   * viewed-as member's roles). Pages and menus shape themselves from this; RLS and the
   * server actions enforce the same list. */
  permissions: Permission[];
  /** The clinic's switched-on modules (permissions already account for them; this is for
   * hiding things no permission covers, like the travel and transfer cards). */
  modules: ClinicModule[];
  clinicId: string;
  /** False when the clinic is suspended (members only; support can still help). */
  clinicActive: boolean;
  /** When the viewer's own photo last changed (members only), for the menu avatar. */
  avatarUpdatedAt: string | null;
  support: SupportContext | null;
}

/** The signed-in account, from the session's access token — verified on this server against
 * the project's public signing key (getClaims), so no round trip to the Auth server. Once per
 * request. A session signed out elsewhere stays valid until its token expires (≤ 1 hour);
 * database rules still refuse a deactivated member. null = signed out. */
export const getAuthClaims = cache(async (): Promise<{ id: string; email: string; aal: string | null } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "", aal: (claims.aal as string | undefined) ?? null };
});

/** What viewer_context() returns (one round trip instead of four in a row). */
interface ViewerContextRow {
  role: string;
  roles: string[] | null;
  clinic_id: string | null;
  display_name: string | null;
  avatar_updated_at: string | null;
  permissions: string[] | null;
  modules: string[] | null;
  clinic_active: boolean | null;
}

/** Resolved once per request. null when there is no usable clinic context (signed out, a
 * superadmin with no open session or without two-factor, an unassigned account). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getAuthClaims();
  if (!user) return null;
  const supabase = await createClient();

  const { data: ctx, error } = await supabase.rpc("viewer_context");
  if (error) console.error("viewer_context failed:", error.message);
  const me = ctx as ViewerContextRow | null;
  if (!me) return null;

  if (me.role !== "superadmin") {
    if (!me.clinic_id) return null;
    return {
      authUserId: user.id,
      email: user.email,
      userId: user.id,
      displayName: me.display_name,
      role: me.role as SellerRole,
      roles: (me.roles ?? []) as MemberRole[],
      permissions: (me.permissions ?? []) as Permission[],
      modules: (me.modules ?? []) as ClinicModule[],
      clinicId: me.clinic_id,
      clinicActive: me.clinic_active !== false,
      avatarUpdatedAt: me.avatar_updated_at,
      support: null,
    };
  }

  // Superadmin: only inside an open support session, and only with two-factor done — the
  // same conditions the database's support_clinic_id() enforces.
  if (user.aal !== "aal2") return null;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: session } = await admin
    .from("support_sessions")
    .select("id, clinic_id, view_as_user_id, expires_at, editing_until")
    .eq("superadmin_id", user.id)
    .is("ended_at", null)
    .gt("expires_at", nowIso)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  const [{ data: clinic }, { data: members }] = await Promise.all([
    admin.from("clinics").select("name").eq("id", session.clinic_id).maybeSingle(),
    admin
      .from("profiles")
      .select("id, display_name, role, roles")
      .eq("clinic_id", session.clinic_id)
      .order("created_at", { ascending: true }),
  ]);
  const memberList = (members ?? []).map((m) => ({
    id: m.id as string,
    name: (m.display_name as string | null) || "Not signed in yet",
    role: m.role as SellerRole,
    roles: (m.roles ?? []) as MemberRole[],
  }));
  const viewAs = memberList.find((m) => m.id === session.view_as_user_id) ?? memberList.find((m) => m.role === "admin");

  const editingUntil = session.editing_until as string | null;
  return {
    authUserId: user.id,
    email: user.email,
    // Nobody to view as (an empty clinic): fall back to the superadmin's own id, which
    // simply owns nothing.
    userId: viewAs?.id ?? user.id,
    displayName: viewAs?.name ?? me.display_name,
    role: viewAs?.role ?? "admin",
    roles: viewAs?.roles ?? ["admin"],
    // my_permissions() already applies support mode (the viewed-as member's roles)
    permissions: (me.permissions ?? []) as Permission[],
    modules: await loadModules(admin, session.clinic_id),
    clinicId: session.clinic_id,
    clinicActive: true,
    avatarUpdatedAt: null,
    support: {
      sessionId: session.id,
      clinicName: clinic?.name ?? "Clinic",
      viewAsName: viewAs?.name ?? null,
      expiresAt: session.expires_at,
      editingUntil,
      canWrite: !!editingUntil && Date.parse(editingUntil) > Date.now(),
      members: memberList,
    },
  };
});

async function loadModules(
  client: Pick<Awaited<ReturnType<typeof createClient>>, "from">,
  clinicId: string
): Promise<ClinicModule[]> {
  const { data, error } = await client.from("clinics").select("modules").eq("id", clinicId).maybeSingle();
  if (error) {
    console.error("clinic modules read failed:", error.message);
    return [];
  }
  return (data?.modules ?? []) as ClinicModule[];
}

/** For clinic-facing server actions that use the service-role client (which RLS's
 * read-only rule can't see): support may only write while editing is unlocked. */
export function assertViewerCanWrite(viewer: Viewer): void {
  if (viewer.support && !viewer.support.canWrite) {
    throw new Error("Support mode is view-only. Unlock editing first.");
  }
}

/** Drop-in for `supabase.auth.getUser()`'s user in clinic pages that treat it as "me": the
 * viewed-as member in support mode, the signed-in member otherwise. */
export async function getViewerUser(): Promise<{ id: string; email: string } | null> {
  const viewer = await getViewer();
  return viewer ? { id: viewer.userId, email: viewer.email } : null;
}

/** For clinic server actions. `id` is who the action is on behalf of (owner of anything
 * created, whose settings change) — the viewed-as member in support mode. `actorId` is who
 * actually did it, which is what the activity log records (RLS requires it to be the
 * signed-in account, and it's how support's changes show as "DentalSeller support"). */
export async function getActingUser(
  { forRead = false }: { forRead?: boolean } = {}
): Promise<{ id: string; actorId: string; email: string; viewer: Viewer }> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Not authenticated");
  // Refuse up front while support is view-only. The database refuses too, but a blocked
  // UPDATE/DELETE just affects 0 rows without erroring — the action would then report
  // success and log an edit that never happened. Actions are writes unless they say so.
  if (!forRead) assertViewerCanWrite(viewer);
  return { id: viewer.userId, actorId: viewer.authUserId, email: viewer.email, viewer };
}

/** Account-level actions (password, own name, Telegram link) belong to the signed-in
 * person themselves — meaningless, or harmful, when support is acting inside a clinic. */
export async function assertNotSupportMode(): Promise<void> {
  if ((await getViewer())?.support) throw new Error("Not available in support mode");
}
