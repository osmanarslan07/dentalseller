import { redirect } from "next/navigation";
import { Permission } from "@/types";
import { getActingUser, getViewer, Viewer } from "@/lib/viewer";

/** What each permission is for lives with the catalog in supabase/schema.sql (permissions /
 * role_permissions); the database is the single source of truth. These helpers only read the
 * viewer's resolved list, so RLS, server actions and pages all agree. */

export function can(viewer: Pick<Viewer, "permissions"> | null | undefined, perm: Permission): boolean {
  return !!viewer?.permissions.includes(perm);
}

export function canAny(viewer: Pick<Viewer, "permissions"> | null | undefined, perms: Permission[]): boolean {
  return perms.some((p) => can(viewer, p));
}

/** For server actions: the acting user (see getActingUser), refused unless they hold one of
 * `perms`. RLS refuses too, but a blocked UPDATE/DELETE just affects 0 rows — without this
 * the action would report success. */
export async function requirePermission(
  perms: Permission | Permission[],
  opts: { forRead?: boolean } = {}
): Promise<Awaited<ReturnType<typeof getActingUser>>> {
  const user = await getActingUser(opts);
  if (!canAny(user.viewer, Array.isArray(perms) ? perms : [perms])) {
    throw new Error("You don't have permission to do that");
  }
  return user;
}

/** For pages: the viewer, or back to the dashboard when they may not see this page. */
export async function requirePagePermission(perms: Permission | Permission[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !canAny(viewer, Array.isArray(perms) ? perms : [perms])) redirect("/");
  return viewer;
}
