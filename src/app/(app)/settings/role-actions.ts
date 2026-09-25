"use server";

import { st } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { getClinicRoles } from "@/lib/roles";
import { grantablePermissions } from "@/lib/permission-catalog";
import { isBuiltinRole } from "@/types";

function revalidate() {
  revalidatePath("/", "layout");
}

/** "+ Coordinator: payments.edit · − files.delete" for the activity log. */
function describeChange(before: string[], after: string[]): string {
  const added = after.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !after.includes(p));
  return [added.length ? `+ ${added.join(", ")}` : null, removed.length ? `− ${removed.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ") || "no change";
}

/** roles.edit — create a role (key null) or change one. The database function checks the
 * permission, refuses the Admin role and unknown permissions, and keeps names unique. */
export async function saveRole(key: string | null, name: string, permissions: string[]): Promise<string> {
  const user = await requirePermission("roles.edit");
  const supabase = await createClient();
  const perms = grantablePermissions(permissions);
  const before = key ? (await getClinicRoles(supabase, user.viewer.clinicId)).find((r) => r.key === key) ?? null : null;
  if (key && !before) throw new Error(await st("Role not found"));

  const { data, error } = await supabase.rpc("save_clinic_role", {
    p_key: key,
    p_name: name,
    p_permissions: perms,
  });
  if (error) throw new Error(error.message);
  const savedKey = data as string;

  if (!before) {
    await logActivity(supabase, user.actorId, "role_created", "role", null, `${name.trim()}: ${perms.join(", ") || "nothing"}`);
  } else {
    const renamed = !before.builtin && before.name !== name.trim() ? `renamed ${before.name} → ${name.trim()} · ` : "";
    await logActivity(
      supabase,
      user.actorId,
      "role_changed",
      "role",
      null,
      `${before.builtin ? before.name : name.trim()}: ${renamed}${describeChange(before.permissions, perms)}`
    );
  }
  revalidate();
  return savedKey;
}

/** roles.edit — a built-in role back to the platform's default. */
export async function resetRole(key: string): Promise<void> {
  const user = await requirePermission("roles.edit");
  if (!isBuiltinRole(key) || key === "admin") throw new Error(await st("Only a built-in role can be reset"));
  const supabase = await createClient();
  const before = (await getClinicRoles(supabase, user.viewer.clinicId)).find((r) => r.key === key);

  const { error } = await supabase.rpc("reset_clinic_role", { p_key: key });
  if (error) throw new Error(error.message);

  if (before?.customised) {
    await logActivity(
      supabase,
      user.actorId,
      "role_reset",
      "role",
      null,
      `${before.name}: back to default (${describeChange(before.permissions, before.defaults ?? [])})`
    );
  }
  revalidate();
}

/** roles.delete — a custom role nobody holds any more. */
export async function deleteRole(key: string): Promise<void> {
  const user = await requirePermission("roles.delete");
  const supabase = await createClient();
  const before = (await getClinicRoles(supabase, user.viewer.clinicId)).find((r) => r.key === key);

  const { error } = await supabase.rpc("delete_clinic_role", { p_key: key });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "role_deleted", "role", null, before?.name ?? key);
  revalidate();
}
