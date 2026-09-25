"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClinicRole } from "@/lib/roles";
import { ClinicModule } from "@/types";
import { isOffForModules, PERMISSION_GROUPS } from "@/lib/permission-catalog";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { deleteRole, resetRole, saveRole } from "./role-actions";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

/** Settings → Roles: every role's permissions side by side, and (with roles.edit /
 * roles.delete) creating, changing, resetting and deleting roles. The database enforces the
 * same rules: Admin always has everything, a role in use can't be deleted. */
export function RolesCard({
  roles,
  memberCounts,
  modules,
  canEdit,
  canDelete,
}: {
  roles: ClinicRole[];
  memberCounts: Record<string, number>;
  modules: ClinicModule[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  /** The role being edited: its key, or "new". */
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function run(action: () => Promise<unknown>, done: string, after?: () => void) {
    startTransition(async () => {
      try {
        await action();
        showToast(done);
        after?.();
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Something went wrong"), "error");
      }
    });
  }

  const editingRole = editing && editing !== "new" ? roles.find((r) => r.key === editing) ?? null : null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Roles")}</h2>
          <p className="text-sm text-slate-500">
            {t("What each role can do. Someone with several roles can do everything any of them allows. Admin always has everything.")}
          </p>
        </div>
        {canEdit && editing === null && (
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            + {t("New role")}
          </Button>
        )}
      </div>

      {editing !== null && (
        <RoleEditor
          key={editing}
          role={editingRole}
          modules={modules}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(name, permissions) =>
            run(
              () => saveRole(editingRole?.key ?? null, name, permissions),
              editingRole ? t("Role saved ✓") : t("Role created ✓"),
              () => setEditing(null)
            )
          }
        />
      )}

      <div className="-mx-6 overflow-x-auto px-6">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[200px] bg-white pb-3 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Permission")}
              </th>
              {roles.map((r) => (
                <th key={r.key} className="min-w-[104px] px-2 pb-3 text-center align-bottom font-normal">
                  <div className="font-semibold text-slate-900">{t(r.name)}</div>
                  <div className="text-xs text-slate-500">
                    {(memberCounts[r.key] ?? 0) === 1 ? t("1 member") : t("{n} members", { n: memberCounts[r.key] ?? 0 })}
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {!r.builtin && <Badge tone="blue">{t("Custom")}</Badge>}
                    {r.customised && <Badge tone="amber">{t("Changed")}</Badge>}
                  </div>
                  {r.key !== "admin" && (canEdit || (canDelete && !r.builtin)) && (
                    <div className="mt-1.5 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-xs">
                      {canEdit && (
                        <button type="button" className="font-semibold text-teal-700 hover:underline" disabled={pending} onClick={() => setEditing(r.key)}>
                          {t("Edit")}
                        </button>
                      )}
                      {canEdit && r.customised && (
                        <button
                          type="button"
                          className="font-semibold text-slate-600 hover:underline"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(t("Put {role} back to the default permissions?", { role: t(r.name) }))) run(() => resetRole(r.key), t("{role} reset ✓", { role: t(r.name) }));
                          }}
                        >
                          {t("Reset")}
                        </button>
                      )}
                      {canDelete && !r.builtin && (
                        <button
                          type="button"
                          className="font-semibold text-red-600 hover:underline"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(t("Delete the role {role}?", { role: t(r.name) }))) run(() => deleteRole(r.key), t("Role deleted"));
                          }}
                        >
                          {t("Delete")}
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <PermissionRows key={g.label} group={g} roles={roles} modules={modules} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PermissionRows({
  group,
  roles,
  modules,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: ClinicRole[];
  modules: ClinicModule[];
}) {
  const t = useT();
  return (
    <>
      <tr>
        <td
          colSpan={roles.length + 1}
          className="sticky left-0 border-t border-slate-100 bg-white pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {t(group.label)}
        </td>
      </tr>
      {group.permissions.map((p) => {
        const off = isOffForModules(p, modules);
        return (
          <tr key={p.key} className={off ? "text-slate-400" : "text-slate-700"}>
            <td className="sticky left-0 min-w-[200px] bg-white py-1.5 pr-3">
              {t(p.label)}
              {off && <span className="ml-1 text-xs">({t("module off")})</span>}
            </td>
            {roles.map((r) => {
              const on = r.permissions.includes(p.key);
              return (
                <td key={r.key} className="px-2 py-1.5 text-center">
                  {on ? (
                    <span className={off ? "text-slate-300" : "font-semibold text-teal-600"} aria-label={t("Yes")}>
                      ✓
                    </span>
                  ) : (
                    <span className="text-slate-300" aria-label={t("No")}>
                      –
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function RoleEditor({
  role,
  modules,
  pending,
  onCancel,
  onSave,
}: {
  role: ClinicRole | null;
  modules: ClinicModule[];
  pending: boolean;
  onCancel: () => void;
  onSave: (name: string, permissions: string[]) => void;
}) {
  const t = useT();
  const [name, setName] = useState(role?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const builtin = !!role?.builtin;

  function toggle(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(name, [...picked]);
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {role ? t("Edit {role}", { role: t(role.name) }) : t("New role")}
      </h3>
      {!builtin && (
        <div className="mb-4 max-w-xs">
          <Label>{t("Name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder={t("e.g. Receptionist")} autoFocus />
        </div>
      )}
      {builtin && (
        <p className="mb-4 text-xs text-slate-500">
          {rich(t("Changes apply to this clinic only. {default} marks what {role} has out of the box; Reset in the table takes it back."), {
            default: <span className="font-semibold">{t("default")}</span>,
            role: t(role?.name ?? ""),
          })}
        </p>
      )}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(g.label)}</legend>
            {g.permissions.map((p) => {
              const off = isOffForModules(p, modules);
              return (
                <label key={p.key} className={`flex items-start gap-2 py-0.5 text-sm ${off ? "text-slate-400" : "text-slate-700"}`}>
                  <input
                    type="checkbox"
                    checked={picked.has(p.key)}
                    onChange={() => toggle(p.key)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                  />
                  <span>
                    {t(p.label)}
                    {off && <span className="ml-1 text-xs">({t("module off")})</span>}
                    {builtin && role?.defaults?.includes(p.key) && (
                      <span className="ml-1 text-xs font-semibold text-slate-400">{t("default")}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("Saving…") : role ? t("Save role") : t("Create role")}
        </Button>
      </div>
    </form>
  );
}
