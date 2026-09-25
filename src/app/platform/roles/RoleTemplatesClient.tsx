"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { PERMISSION_GROUPS } from "@/lib/permission-catalog";
import { Permission } from "@/types";
import { updateRoleTemplate } from "../actions";

type TemplateRole = "sales" | "coordinator" | "accountant";
const ROLES: { key: TemplateRole; name: string }[] = [
  { key: "sales", name: "Sales" },
  { key: "coordinator", name: "Coordinator" },
  { key: "accountant", name: "Accountant" },
];

export function RoleTemplatesClient({
  templates,
  customisedCount,
}: {
  templates: Record<TemplateRole, Permission[]>;
  customisedCount: Record<string, number>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {ROLES.map((r) => (
        <TemplateCard
          key={r.key}
          role={r.key}
          name={r.name}
          initial={templates[r.key]}
          customised={customisedCount[r.key] ?? 0}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  role,
  name,
  initial,
  customised,
}: {
  role: TemplateRole;
  name: string;
  initial: Permission[];
  customised: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const dirty = picked.size !== initial.length || initial.some((p) => !picked.has(p));

  function toggle(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    if (!confirm(`Change the ${name} template for every clinic that hasn't changed ${name} itself?`)) return;
    startTransition(async () => {
      try {
        await updateRoleTemplate(role, [...picked]);
        showToast(`${name} template saved ✓`);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      }
    });
  }

  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-base font-semibold text-slate-900">{name}</h2>
      <p className="mb-4 text-xs text-slate-500">
        {customised === 0
          ? "No clinic has changed this role — all follow this template."
          : `${customised} ${customised === 1 ? "clinic has" : "clinics have"} changed this role and keep their own version.`}
      </p>
      <div className="flex grow flex-col gap-4">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</legend>
            {g.permissions.map((p) => (
              <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={picked.has(p.key)}
                  onChange={() => toggle(p.key)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {dirty && (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setPicked(new Set(initial))}>
            Undo
          </Button>
        )}
        <Button type="button" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </Card>
  );
}
