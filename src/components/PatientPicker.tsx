"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { searchPatients } from "@/lib/patient-lookup-actions";
import { useT } from "@/i18n/client";

export interface PickedPatient {
  id: string;
  name: string;
}

/** Type-to-search patient picker: a few letters find matching patients on the server, so it
 * works the same at 30 patients or 30,000. The chosen id is submitted as `name` (empty when
 * nobody is picked), like the <select> it replaces. */
export function PatientPicker({
  name,
  value,
  onChange,
  placeholder,
  className = "",
  "aria-label": ariaLabel,
}: {
  name: string;
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useT();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Searches a moment after typing stops, so each keystroke isn't a request. */
  function type(text: string) {
    setQuery(text);
    setOpen(true);
    clearTimeout(timer.current);
    const q = text.trim();
    const ticket = ++latest.current;
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const found = await searchPatients(q);
        // a slower, older search must not overwrite a newer one
        if (ticket === latest.current) {
          setResults(found);
          setActive(0);
        }
      } catch {
        if (ticket === latest.current) setResults([]);
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, 250);
  }

  function pick(p: PickedPatient) {
    onChange(p);
    type("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // With text typed, Enter picks the highlighted match — and never submits the
      // surrounding form half-way (e.g. before the matches have arrived)
      if (query.trim()) {
        e.preventDefault();
        if (results[active]) pick(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const box =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20";

  if (value) {
    return (
      <div className={`flex items-center justify-between gap-2 ${box} ${className}`}>
        <input type="hidden" name={name} value={value.id} />
        <span className="truncate">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          aria-label={t("Clear patient")}
        >
          ✕
        </button>
      </div>
    );
  }

  const showList = open && query.trim().length > 0;
  return (
    <div className={`relative ${className}`}>
      <input type="hidden" name={name} value="" />
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={query}
        placeholder={placeholder ?? t("Search patients…")}
        onChange={(e) => type(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={`${box} placeholder:text-slate-400 focus:outline-none`}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">{loading ? t("Searching…") : t("No patients match.")}</li>
          ) : (
            results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${i === active ? "bg-teal-50 text-teal-800" : "text-slate-700"}`}
              >
                {p.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
