"use client";

import { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import { useCan } from "@/components/permissions";
import { Permission } from "@/types";

export const gbp = (n: number) => formatCurrency(n, "GBP");

/** A white card with a title row — every section of the patient page. */
export function Section({
  title,
  aside,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:px-5 sm:py-5 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {aside}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** The "Edit" link at the top right of a read-only card — shown only to people allowed to
 * make that edit (`perm`, patients.edit by default). */
export function EditButton({
  onClick,
  label = "Edit",
  disabled,
  perm = "patients.edit",
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  perm?: Permission;
}) {
  const allowed = useCan(perm);
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-40"
    >
      <PencilIcon />
      {label}
    </button>
  );
}

/** "Editing" chip shown in a card's title row while its form is open. */
export function EditingChip() {
  return <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">Editing</span>;
}

/** A label above a value, for read-only cards. */
export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 text-sm ${className}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <div className="font-semibold text-slate-900">{children}</div>
    </div>
  );
}

/** Buttons in place of a dropdown — for 2–4 choices. Posts its value under `name` when given. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  name?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-slate-100 p-1" role="radiogroup">
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-semibold transition ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
            o.value === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A button in place of a checkbox — green with a tick when on. Posts "on" under `name` when on. */
export function Toggle({
  on,
  onChange,
  children,
  name,
  disabled,
  title,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
  name?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <>
      {name && on && <input type="hidden" name={name} value="on" />}
      <button
        type="button"
        aria-pressed={on}
        disabled={disabled}
        title={title}
        onClick={() => onChange(!on)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
          on
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {on ? (
          <CheckIcon />
        ) : (
          <span className="inline-block h-3.5 w-3.5 rounded border-[1.5px] border-slate-300" aria-hidden />
        )}
        {children}
      </button>
    </>
  );
}

/** − n + for pax. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 50,
  disabled,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label: string;
}) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  return (
    <span className="flex items-center gap-2">
      <button type="button" aria-label={`Fewer ${label}`} className={btn} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="w-6 text-center text-[15px] font-semibold text-slate-900">{value}</span>
      <button type="button" aria-label={`More ${label}`} className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

const PILL_TONES = {
  slate: "bg-slate-100 text-slate-700",
  teal: "bg-teal-50 text-teal-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};
export type PillTone = keyof typeof PILL_TONES;

export function Pill({ tone = "slate", children, small }: { tone?: PillTone; children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      } ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const LABEL_CAPS = "text-xs font-semibold uppercase tracking-wider text-slate-500";
