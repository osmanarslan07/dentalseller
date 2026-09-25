"use client";

import { ClinicModule } from "@/types";
import { useT } from "@/i18n/client";
import { isOffForModules, PERMISSION_GROUPS } from "@/lib/permission-catalog";

/** What someone can do, in plain words, grouped like the Roles page. Only what they have is
 * listed; something their clinic's plan doesn't include is marked "module off". */
export function PermissionSummary({
  permissions,
  modules,
  empty = "Nothing yet.",
}: {
  permissions: string[];
  modules: ClinicModule[];
  empty?: string;
}) {
  const t = useT();
  const groups = PERMISSION_GROUPS.map((g) => ({
    label: g.label,
    items: g.permissions.filter((p) => permissions.includes(p.key)),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return <p className="text-sm text-slate-500">{t(empty)}</p>;

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(g.label)}</dt>
          {g.items.map((p) => {
            const off = isOffForModules(p, modules);
            return (
              <dd key={p.key} className={`mt-1 flex gap-1.5 text-sm ${off ? "text-slate-400" : "text-slate-700"}`}>
                <span aria-hidden className={off ? "text-slate-300" : "text-teal-600"}>✓</span>
                <span>
                  {t(p.label)}
                  {off && <span className="ml-1 text-xs">({t("module off")})</span>}
                </span>
              </dd>
            );
          })}
        </div>
      ))}
    </dl>
  );
}
