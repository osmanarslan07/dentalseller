"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface FilterChoice {
  value: string;
  label: string;
}

/** A filter button that opens a checklist: tick any number of choices, or none for "All".
 * Closes on a click outside or Escape; a search box appears once the list gets long. */
export function MultiSelectFilter({
  title,
  allLabel,
  choices,
  selected,
  onChange,
}: {
  /** "Seller" / "Coordinator" — prefixes the button text when something is chosen. */
  title: string;
  /** "All sellers" — the button text when nothing is chosen. */
  allLabel: string;
  choices: FilterChoice[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const labelOf = (v: string) => choices.find((c) => c.value === v)?.label ?? v;
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length <= 2
        ? `${title}: ${selected.map(labelOf).join(", ")}`
        : `${title}: ${labelOf(selected[0])} +${selected.length - 1}`;

  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter((c) => c.label.toLowerCase().includes(q)) : choices;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex max-w-[240px] items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
          selected.length > 0
            ? "border-teal-300 bg-teal-50 font-medium text-teal-800"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <span className="truncate">{summary}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-none opacity-60" aria-hidden>
          <path fillRule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={title}
          className="animate-fade-in absolute left-0 top-full z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {choices.length > 7 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${title.toLowerCase()}s`}
              autoFocus
              className="mb-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500"
            />
          )}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="font-medium text-slate-700">{allLabel}</span>
          </label>
          <div className="my-1 border-t border-slate-100" />
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-slate-400">No match.</p>
            ) : (
              shown.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.value)}
                    onChange={() => toggle(c.value)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="truncate text-slate-700">{c.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
