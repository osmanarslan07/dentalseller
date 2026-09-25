"use client";

import { MemberRole } from "@/types";
import type { ClinicRole } from "@/lib/roles";

/** One tick-button per role (built-in and the clinic's own); the member holds every role that's on. */
export function RoleChips({
  roles,
  options,
  disabled,
  onToggle,
}: {
  roles: MemberRole[];
  options: ClinicRole[];
  disabled?: boolean;
  onToggle: (role: MemberRole) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Roles">
      {options.map(({ key, name }) => {
        const role = key as MemberRole;
        const on = roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(role)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-50 ${
              on ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {on ? "✓ " : ""}
            {name}
          </button>
        );
      })}
    </div>
  );
}
