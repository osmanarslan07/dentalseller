"use client";

import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A date field that always reads dd/mm/yyyy, whatever the browser's language.
 * Submits the usual YYYY-MM-DD under `name`, like a native date input; the
 * calendar button opens a month picker whose weeks start on Monday.
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
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // The value changed from outside (or via the calendar) — show it.
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
    <div ref={boxRef} className={`relative ${className}`}>
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
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-teal-600"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <CalendarPopover
          anchor={boxRef}
          iso={iso}
          onPick={(next) => {
            setText(isoToDmy(next));
            commit(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Month grid, Monday first. Rendered on <body> so a scrolling modal can't clip it. */
function CalendarPopover({
  anchor,
  iso,
  onPick,
  onClose,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  iso: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const todayIso = toIso(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (iso || todayIso).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Sit under the field (or above it when there's no room), inside the viewport.
  useLayoutEffect(() => {
    function place() {
      const box = anchor.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!box || !pop) return;
      const h = pop.offsetHeight;
      const w = pop.offsetWidth;
      const below = box.bottom + 4;
      const top = below + h > window.innerHeight - 8 && box.top - h - 4 > 8 ? box.top - h - 4 : below;
      const left = Math.max(8, Math.min(box.left, window.innerWidth - w - 8));
      setPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  // Click outside or Escape closes it (Escape doesn't also close the modal behind).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !anchor.current?.contains(t)) closeRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => toIso(new Date(cursor.y, cursor.m, i + 1)));
  const shift = (by: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + by, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label="Choose date"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-[60] w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-800">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-[11px] font-medium text-slate-400">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} />
        ))}
        {days.map((dIso, i) => (
          <button
            key={dIso}
            type="button"
            onClick={() => onPick(dIso)}
            aria-label={isoToDmy(dIso)}
            aria-pressed={dIso === iso}
            className={`h-8 rounded-md text-sm ${
              dIso === iso
                ? "bg-teal-600 font-semibold text-white"
                : dIso === todayIso
                  ? "font-semibold text-teal-700 ring-1 ring-inset ring-teal-300 hover:bg-teal-50"
                  : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs">
        <button type="button" onClick={() => onPick(todayIso)} className="font-medium text-teal-700 hover:underline">
          Today
        </button>
        {iso && (
          <button type="button" onClick={() => onPick("")} className="text-slate-500 hover:underline">
            Clear
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
