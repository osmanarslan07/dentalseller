"use client";

import { useRef, useState } from "react";

/** "2026-09-25" → "25/09/2026"; anything else → "". */
function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "25/09/2026" (or 25.9.2026, 25-9-2026) → "2026-09-25"; invalid → null. */
function dmyToIso(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Slashes appear as you type digits: "2509" → "25/09". */
function autoSlash(raw: string, prev: string): string {
  if (raw.length < prev.length) return raw; // deleting — leave it alone
  if (/[^\d]/.test(raw.replace(/\//g, ""))) return raw; // typed separators themselves
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits.length === 2 ? `${digits}/` : digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}${digits.length === 4 ? "/" : ""}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * A date field that always reads dd/mm/yyyy, whatever the browser's language.
 * Submits the usual YYYY-MM-DD under `name`, like a native date input; the
 * calendar button still opens the browser's own picker.
 */
export function DateInput({
  name,
  value,
  defaultValue = "",
  onChange,
  required,
  autoFocus,
  className = "w-full",
  "aria-label": ariaLabel,
}: {
  name?: string;
  /** Controlled YYYY-MM-DD. */
  value?: string;
  defaultValue?: string;
  /** Called with YYYY-MM-DD, or "" when cleared. */
  onChange?: (iso: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const controlled = value !== undefined;
  const [ownIso, setOwnIso] = useState(defaultValue);
  const iso = controlled ? value : ownIso;
  const [text, setText] = useState(isoToDmy(iso));
  const [shownIso, setShownIso] = useState(iso);
  const pickerRef = useRef<HTMLInputElement>(null);

  // The value changed from outside (or via the picker) — show it.
  if (iso !== shownIso) {
    setShownIso(iso);
    if (dmyToIso(text) !== iso) setText(isoToDmy(iso));
  }

  function commit(next: string) {
    if (next === iso) return;
    if (!controlled) setOwnIso(next);
    onChange?.(next);
  }

  function handleType(input: HTMLInputElement) {
    const next = autoSlash(input.value, text);
    setText(next);
    const parsed = next.trim() === "" ? "" : dmyToIso(next);
    input.setCustomValidity(parsed === null ? "Use dd/mm/yyyy" : "");
    if (parsed !== null) commit(parsed);
  }

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={iso} />}
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        autoComplete="off"
        value={text}
        onChange={(e) => handleType(e.target)}
        onBlur={(e) => {
          e.target.setCustomValidity("");
          setText(isoToDmy(iso));
        }}
        required={required}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      />
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        onChange={(e) => {
          setText(isoToDmy(e.target.value));
          commit(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar"
        onClick={() => {
          try {
            pickerRef.current?.showPicker();
          } catch {
            pickerRef.current?.focus();
          }
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-teal-600"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
