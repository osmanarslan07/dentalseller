import { SupabaseClient } from "@supabase/supabase-js";
import { BuiltinRole, isBuiltinRole, MEMBER_ROLES, Permission, ROLE_LABELS } from "@/types";
import { ALL_PERMISSIONS, grantablePermissions } from "@/lib/permission-catalog";

/** One of the clinic's roles, with what it may do right now — the same answer the database's
 * role_has_permission() gives, so the Roles page can't drift from what's enforced. */
export interface ClinicRole {
  key: string;
  name: string;
  builtin: boolean;
  /** A built-in role this clinic has changed (Reset takes it back to the default). */
  customised: boolean;
  permissions: Permission[];
  /** The platform's default for a built-in role — shown next to a customised one. */
  defaults: Permission[] | null;
}

/** Built-in roles first (Admin, Sales, Coordinator, Accountant), then custom roles by name. */
export async function getClinicRoles(supabase: SupabaseClient, clinicId: string): Promise<ClinicRole[]> {
  const [{ data: templates, error: tErr }, { data: rows, error: rErr }, { data: grants, error: gErr }] = await Promise.all([
    supabase.from("role_permissions").select("role, permission"),
    supabase.from("clinic_roles").select("key, name, is_builtin").eq("clinic_id", clinicId),
    supabase.from("clinic_role_permissions").select("role, permission").eq("clinic_id", clinicId),
  ]);
  if (tErr) throw tErr;
  if (rErr) throw rErr;
  if (gErr) throw gErr;

  const templateOf = (role: string) =>
    grantablePermissions((templates ?? []).filter((t) => t.role === role).map((t) => t.permission as string));
  const grantsOf = (role: string) =>
    grantablePermissions((grants ?? []).filter((g) => g.role === role).map((g) => g.permission as string));
  const clinicRow = (key: string) => (rows ?? []).find((r) => r.key === key);

  const builtins: ClinicRole[] = MEMBER_ROLES.map((key: BuiltinRole) => {
    if (key === "admin") {
      return { key, name: ROLE_LABELS.admin, builtin: true, customised: false, permissions: ALL_PERMISSIONS.map((p) => p.key), defaults: null };
    }
    const customised = !!clinicRow(key);
    const defaults = templateOf(key);
    return { key, name: ROLE_LABELS[key], builtin: true, customised, permissions: customised ? grantsOf(key) : defaults, defaults };
  });

  const custom: ClinicRole[] = (rows ?? [])
    .filter((r) => !r.is_builtin && !isBuiltinRole(r.key))
    .map((r) => ({
      key: r.key as string,
      name: (r.name as string) ?? "Custom role",
      builtin: false,
      customised: false,
      permissions: grantsOf(r.key),
      defaults: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...builtins, ...custom];
}

/** key → name for the clinic's custom roles, for roleLabel(). */
export function customRoleNames(roles: ClinicRole[]): Record<string, string> {
  return Object.fromEntries(roles.filter((r) => !r.builtin).map((r) => [r.key, r.name]));
}

/** The default templates for the built-in roles (platform, service-role client). */
export async function getRoleTemplates(client: SupabaseClient): Promise<Record<Exclude<BuiltinRole, "admin">, Permission[]>> {
  const { data, error } = await client.from("role_permissions").select("role, permission");
  if (error) throw error;
  const of = (role: string) => grantablePermissions((data ?? []).filter((t) => t.role === role).map((t) => t.permission as string));
  return { sales: of("sales"), coordinator: of("coordinator"), accountant: of("accountant") };
}
