"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Card } from "@/components/ui";
import { Patient } from "@/types";
import { createTask } from "@/app/(app)/tasks/actions";

export function NeedsFollowUpCard({
  items,
  remindedPatientIds,
  todayIso,
}: {
  items: { patient: Patient; daysSince: number | null }[];
  /** Patients that already have a pending task — "Remind me" greys out for these from the start. */
  remindedPatientIds: string[];
  todayIso: string;
}) {
  const { showToast } = useToast();
  const [reminded, setReminded] = useState(() => new Set(remindedPatientIds));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRemind(p: Patient) {
    setPendingId(p.id);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("title", `Book visit 2 — ${p.name}`);
        formData.set("due_date", todayIso);
        formData.set("patient_id", p.id);
        formData.set("patient_name", p.name);
        await createTask(formData);
        setReminded((prev) => new Set(prev).add(p.id));
        showToast("Reminder added to Tasks ✓");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to add reminder", "error");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Needs follow-up</h2>
          <p className="text-xs text-slate-500">Visit 1 done, visit 2 not booked yet</p>
        </div>
        {items.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Nothing needs follow-up ✓</p>
      ) : (
        <ul className="space-y-1">
          {items.map(({ patient: p, daysSince }, i) => (
            <li key={p.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition hover:bg-slate-50">
                <Link href={`/patients?q=${encodeURIComponent(p.name)}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.treatment ? `${p.treatment} · ` : ""}Visit 1 completed {formatDate(p.visit1_date)}
                  </p>
                </Link>
                <span
                  className={`shrink-0 text-xs font-medium ${
                    daysSince != null && daysSince >= 30
                      ? "text-red-500"
                      : daysSince != null && daysSince >= 14
                      ? "text-amber-600"
                      : "text-slate-400"
                  }`}
                >
                  {daysSince == null
                    ? "—"
                    : daysSince === 0
                    ? "Today"
                    : daysSince === 1
                    ? "1 day ago"
                    : `${daysSince} days ago`}
                </span>
                <button
                  type="button"
                  disabled={pendingId === p.id || reminded.has(p.id)}
                  onClick={() => handleRemind(p)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  {reminded.has(p.id) ? "Reminder set ✓" : pendingId === p.id ? "Adding…" : "Remind me"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
