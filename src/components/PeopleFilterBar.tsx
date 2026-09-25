"use client";

import { useState, useTransition } from "react";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { useToast } from "@/components/Toast";
import { ALL_FILTER, FilterPage, PeopleFilter, isAllFilter, sameFilter } from "@/lib/people-filter";
import { saveMyDefaultFilter } from "@/lib/people-filter-actions";

export interface PersonOption {
  id: string;
  name: string;
}

/** Seller + Coordinator filters side by side — each a checklist, so several people can be
 * combined — with "Save as my default" and "Reset to All". The page owns the value; this only
 * edits it and saves the viewer's own default. People who have never signed in aren't
 * offered (the caller's lists already leave them out). */
export function PeopleFilterBar({
  page,
  value,
  onChange,
  sellers,
  coordinators,
  savedDefault,
  currentUserId,
  className = "",
}: {
  page: FilterPage;
  value: PeopleFilter;
  onChange: (next: PeopleFilter) => void;
  sellers: PersonOption[];
  coordinators: PersonOption[];
  /** The viewer's saved default for this page (All when they have none). */
  savedDefault: PeopleFilter;
  currentUserId: string;
  className?: string;
}) {
  const [saved, setSaved] = useState(savedDefault);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  function save(next: PeopleFilter | null) {
    startTransition(async () => {
      try {
        await saveMyDefaultFilter(page, next);
        setSaved(next ?? ALL_FILTER);
        showToast(next ? "Saved as your default ✓" : "Default reset to All ✓");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Couldn't save the default", "error");
      }
    });
  }

  const others = (list: PersonOption[]) =>
    list.filter((o) => o.id !== currentUserId).map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <MultiSelectFilter
        title="Seller"
        allLabel="All sellers"
        choices={[{ value: "me", label: "Me" }, ...others(sellers)]}
        selected={value.sellers}
        onChange={(sellersChosen) => onChange({ ...value, sellers: sellersChosen })}
      />
      <MultiSelectFilter
        title="Coordinator"
        allLabel="All coordinators"
        choices={[{ value: "me", label: "Me" }, { value: "none", label: "No coordinator" }, ...others(coordinators)]}
        selected={value.coordinators}
        onChange={(coordinatorsChosen) => onChange({ ...value, coordinators: coordinatorsChosen })}
      />
      {!sameFilter(value, saved) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => save(isAllFilter(value) ? null : value)}
          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          Save as my default
        </button>
      )}
      {!isAllFilter(value) && (
        <button
          type="button"
          onClick={() => onChange(ALL_FILTER)}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Reset to All
        </button>
      )}
    </div>
  );
}
