import { requireSuperadmin } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleTemplates } from "@/lib/roles";
import { RoleTemplatesClient } from "./RoleTemplatesClient";

export default async function PlatformRolesPage() {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [templates, { data: customised }] = await Promise.all([
    getRoleTemplates(admin),
    admin.from("clinic_roles").select("key").eq("is_builtin", true),
  ]);
  const customisedCount: Record<string, number> = {};
  for (const r of customised ?? []) customisedCount[r.key] = (customisedCount[r.key] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Role templates</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          What Sales, Coordinator and Accountant can do by default, in every clinic. Admin always has everything. A
          clinic that has changed a role in its own Clinic settings → Team & roles keeps its version; the rest follow these at once.
        </p>
      </div>
      <RoleTemplatesClient templates={templates} customisedCount={customisedCount} />
    </div>
  );
}
