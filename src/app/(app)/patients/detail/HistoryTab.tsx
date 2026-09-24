"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ActivityLogRow, describeActivity } from "@/lib/activity-log";
import { Patient, Profile, Seller } from "@/types";
import { peopleNameMap } from "@/lib/sellers";
import { Pill, PillTone } from "./bits";

type Filter = "All" | "Payments" | "Transfers" | "Visits" | "Details";
const FILTERS: Filter[] = ["All", "Payments", "Transfers", "Visits", "Details"];
const TAG_TONES: Record<Exclude<Filter, "All">, PillTone> = { Payments: "green", Transfers: "blue", Visits: "teal", Details: "slate" };
const AVATAR_COLOURS = ["bg-teal-700", "bg-violet-600", "bg-amber-700", "bg-sky-700", "bg-rose-700", "bg-emerald-700"];

/** Which filter an entry belongs to. A patient edit counts as a visit change when it only
 * touched visit fields ("visit1 date …, visit1 pax …"). */
function tagOf(e: ActivityLogRow): Exclude<Filter, "All"> {
  if (e.action.startsWith("payment_") || e.action.startsWith("extra_")) return "Payments";
  if (e.action.startsWith("transfer_")) return "Transfers";
  if (e.action.startsWith("visit_") || e.action === "patient_logistics_toggled") return "Visits";
  if (e.action === "patient_updated" && e.detail && e.detail.split(", ").every((c) => /^visit[12] /.test(c))) return "Visits";
  return "Details";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label = format(d, "EEE d MMM yyyy");
  if (d.toDateString() === today.toDateString()) return `Today · ${label}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${label}`;
  return label;
}

export function HistoryTab({
  patient,
  profiles,
  sellers,
  entries,
  error,
}: {
  patient: Patient;
  profiles: Profile[];
  sellers: Seller[];
  /** Null while loading. */
  entries: ActivityLogRow[] | null;
  error: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const nameById = peopleNameMap(profiles, sellers);
  const patientNameById = new Map([[patient.id, patient.name]]);
  const colourOf = (id: string | null) => {
    const i = profiles.findIndex((p) => p.id === id);
    return i < 0 ? "bg-slate-500" : AVATAR_COLOURS[i % AVATAR_COLOURS.length];
  };

  const shown = (entries ?? []).filter((e) => filter === "All" || tagOf(e) === filter);
  const days: { day: string; items: ActivityLogRow[] }[] = [];
  for (const e of shown) {
    const day = dayLabel(e.created_at);
    if (days[days.length - 1]?.day !== day) days.push({ day, items: [] });
    days[days.length - 1].items.push(e);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={f === filter}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
              f === filter ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="text-[13px] text-slate-500 sm:ml-auto">Every change, who made it and when — kept forever.</span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-1 sm:px-5">
        {error ? (
          <p className="py-6 text-center text-sm text-red-600">{error}</p>
        ) : entries === null ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : days.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{entries.length === 0 ? "Nothing logged yet." : "Nothing of this kind yet."}</p>
        ) : (
          days.map((d) => (
            <div key={d.day}>
              <p className="pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{d.day}</p>
              {d.items.map((e) => {
                const who = e.via_support ? "DentalSeller support" : (e.actor_id && nameById.get(e.actor_id)) || "Someone";
                const full = describeActivity(e, nameById, patientNameById);
                const what = full.startsWith(who) ? full.slice(who.length).trim() : full;
                const tag = tagOf(e);
                return (
                  <div key={e.id} className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        e.via_support ? "bg-slate-800" : colourOf(e.actor_id)
                      }`}
                      aria-hidden
                    >
                      {e.via_support ? "DS" : initials(who)}
                    </span>
                    <p className="min-w-0 grow break-words text-sm">
                      <span className="font-semibold">{who}</span> {what}
                    </p>
                    <span className="hidden sm:inline">
                      <Pill tone={TAG_TONES[tag]} small>
                        {tag}
                      </Pill>
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-[13px] text-slate-500">{format(new Date(e.created_at), "HH:mm")}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
