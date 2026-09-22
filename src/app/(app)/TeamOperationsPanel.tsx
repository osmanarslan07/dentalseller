"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import { CalendarEventKind, KIND_STYLES, flattenCalendarEvents } from "@/lib/calendar-events";
import {
  ExtraVisitLogisticsField,
  PatientLogisticsField,
  setExtraVisitLogisticsFlag,
  setPatientLogisticsFlag,
} from "./patients/actions";
import { Patient, Profile } from "@/types";

const EVENT_ICONS: Record<CalendarEventKind, string> = {
  visit1_arrival: "🛬",
  visit1_departure: "🛫",
  visit2_arrival: "🛬",
  visit2_departure: "🛫",
  visit1_self: "📍",
  visit2_self: "📍",
  extra_visit: "🦷",
};

type Scope = "mine" | "team";

type UpcomingEvent = {
  patientId: string;
  patientName: string;
  responsibleSellerId: string;
  treatment: string | null;
  kind: CalendarEventKind;
  label: string;
  date: string;
  time: string | null;
  flightNo: string | null;
  daysLeft: number;
  expected: number | null;
};

type LogisticsTarget =
  | { scope: "patient"; id: string; field: PatientLogisticsField }
  | { scope: "extra"; id: string; field: ExtraVisitLogisticsField };

type LogisticsBadge = { label: string; ok: boolean; target: LogisticsTarget };

function logisticsTargetKey(t: LogisticsTarget): string {
  return `${t.scope}:${t.id}:${t.field}`;
}

type LogisticsItem = {
  patientId: string;
  patientName: string;
  responsibleSellerId: string;
  label: string;
  date: string;
  badges: LogisticsBadge[];
};

type PaymentMismatch = {
  patient: Patient;
  visitLabel: string;
  visitDate: string;
  expected: number;
  daysSince: number;
};

/** Everything here is operational (arrivals, follow-ups, logistics, unpaid amounts) — none of
 * it reveals commission, which is computed from each seller's own private tier rates and stays
 * confined to the stat cards/chart above. So it's safe to show the whole shared roster here,
 * same as /patients and /calendar already do — this panel just adds a Mine/Whole-team switch
 * and a "Responsible: X" label once there's more than one seller's data on screen. */
export function TeamOperationsPanel({
  allPatients,
  profiles,
  currentUserId,
  currency,
  todayIso,
  monthAheadIso,
}: {
  allPatients: Patient[];
  profiles: Profile[];
  currentUserId: string;
  currency: string;
  todayIso: string;
  monthAheadIso: string;
}) {
  const [scope, setScope] = useState<Scope>("mine");
  const [busyTargetKey, setBusyTargetKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleToggleLogistics(target: LogisticsTarget, value: boolean) {
    const key = logisticsTargetKey(target);
    setBusyTargetKey(key);
    startTransition(async () => {
      try {
        if (target.scope === "patient") await setPatientLogisticsFlag(target.id, target.field, value);
        else await setExtraVisitLogisticsFlag(target.id, target.field, value);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to update", "error");
      } finally {
        setBusyTargetKey(null);
      }
    });
  }

  const sellerName = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.display_name || "Unnamed seller"]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [profiles]);

  const patients = useMemo(
    () => (scope === "mine" ? allPatients.filter((p) => p.responsible_seller_id === currentUserId) : allPatients),
    [allPatients, scope, currentUserId]
  );

  const patientMap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const upcomingEvents = useMemo(() => {
    const events: UpcomingEvent[] = [];
    for (const e of flattenCalendarEvents(patients)) {
      const p = patientMap.get(e.patientId);
      if (!p) continue;
      const isVisit2 = e.kind.startsWith("visit2");
      const isExtra = e.kind === "extra_visit";
      const extraVisit = isExtra ? p.extra_visits.find((v) => v.id === e.extraVisitId) : undefined;
      const status = isExtra ? extraVisit?.status : isVisit2 ? p.visit2_status : p.visit1_status;
      const isDeparture = e.kind === "visit1_departure" || e.kind === "visit2_departure";
      if (!isDeparture && status !== "upcoming") continue;
      if (e.date < todayIso || e.date > monthAheadIso) continue;
      const daysLeft = Math.round(
        (new Date(e.date).getTime() - new Date(todayIso).getTime()) / (1000 * 60 * 60 * 24)
      );
      events.push({
        patientId: e.patientId,
        patientName: e.patientName,
        responsibleSellerId: p.responsible_seller_id,
        treatment: e.treatment,
        kind: e.kind,
        label: e.label,
        date: e.date,
        time: e.time,
        flightNo: e.flightNo,
        daysLeft,
        // Departure shares the same expected amount as its arrival — showing it twice per visit
        // reads as double the money owed, so only the arrival (or self/extra) event carries it.
        expected: isDeparture
          ? null
          : isExtra
            ? extraVisit?.expected ?? null
            : isVisit2
              ? p.visit2_expected
              : p.visit1_expected,
      });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    return events;
  }, [patients, patientMap, todayIso, monthAheadIso]);

  const dayGroups = useMemo(() => {
    const groups: { date: string; daysLeft: number; events: UpcomingEvent[] }[] = [];
    for (const e of upcomingEvents) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.events.push(e);
      else groups.push({ date: e.date, daysLeft: e.daysLeft, events: [e] });
    }
    return groups;
  }, [upcomingEvents]);

  const needsFollowUp = useMemo(() => {
    return patients
      .filter((p) => p.visit1_status === "completed" && p.needs_visit2 && !p.visit2_date)
      .map((p) => {
        const daysSince = p.visit1_date
          ? Math.round((new Date(todayIso).getTime() - new Date(p.visit1_date).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return { patient: p, daysSince };
      })
      .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
  }, [patients, todayIso]);

  const paymentMismatches = useMemo(() => {
    const list: PaymentMismatch[] = [];
    for (const p of patients) {
      const mismatchEntries: readonly (readonly [string, string | null, number | null, number | null, boolean])[] = [
        ["Visit 1", p.visit1_date, p.visit1_expected, p.visit1_actual, true],
        ["Visit 2", p.visit2_date, p.visit2_expected, p.visit2_actual, p.needs_visit2],
        ...p.extra_visits.map((v) => [v.label, v.visit_date, v.expected, v.actual, true] as const),
      ];
      for (const [visitLabel, date, expected, actual, applies] of mismatchEntries) {
        // A zero-expected visit (e.g. a comped extra visit) isn't unpaid — it was never owed.
        if (!applies || !date || !expected || actual != null || date >= todayIso) continue;
        const daysSince = Math.round((new Date(todayIso).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
        list.push({ patient: p, visitLabel, visitDate: date, expected, daysSince });
      }
    }
    list.sort((a, b) => b.daysSince - a.daysSince);
    return list;
  }, [patients, todayIso]);

  const logisticsNotArranged = useMemo(() => {
    const list: LogisticsItem[] = [];
    const push = (
      patientId: string,
      patientName: string,
      responsibleSellerId: string,
      label: string,
      date: string | null,
      badges: LogisticsBadge[]
    ) => {
      if (!date || date < todayIso) return;
      if (badges.every((b) => b.ok)) return;
      list.push({ patientId, patientName, responsibleSellerId, label, date, badges });
    };
    const patientField = (id: string, field: PatientLogisticsField): LogisticsTarget => ({
      scope: "patient",
      id,
      field,
    });
    const extraField = (id: string, field: ExtraVisitLogisticsField): LogisticsTarget => ({
      scope: "extra",
      id,
      field,
    });
    for (const p of patients) {
      push(p.id, p.name, p.responsible_seller_id, "Visit 1 · arrival", p.visit1_arrival_date, [
        {
          label: "Arrival transfer",
          ok: p.visit1_arrival_transfer_arranged,
          target: patientField(p.id, "visit1_arrival_transfer_arranged"),
        },
        { label: "Hotel", ok: p.visit1_hotel_arranged, target: patientField(p.id, "visit1_hotel_arranged") },
      ]);
      push(p.id, p.name, p.responsible_seller_id, "Visit 1 · departure", p.visit1_departure_date, [
        {
          label: "Departure transfer",
          ok: p.visit1_departure_transfer_arranged,
          target: patientField(p.id, "visit1_departure_transfer_arranged"),
        },
      ]);
      if (p.needs_visit2) {
        push(p.id, p.name, p.responsible_seller_id, "Visit 2 · arrival", p.visit2_arrival_date, [
          {
            label: "Arrival transfer",
            ok: p.visit2_arrival_transfer_arranged,
            target: patientField(p.id, "visit2_arrival_transfer_arranged"),
          },
          { label: "Hotel", ok: p.visit2_hotel_arranged, target: patientField(p.id, "visit2_hotel_arranged") },
        ]);
        push(p.id, p.name, p.responsible_seller_id, "Visit 2 · departure", p.visit2_departure_date, [
          {
            label: "Departure transfer",
            ok: p.visit2_departure_transfer_arranged,
            target: patientField(p.id, "visit2_departure_transfer_arranged"),
          },
        ]);
      }
      for (const v of p.extra_visits) {
        push(p.id, p.name, p.responsible_seller_id, `${v.label} · arrival`, v.arrival_date, [
          {
            label: "Arrival transfer",
            ok: v.arrival_transfer_arranged,
            target: extraField(v.id, "arrival_transfer_arranged"),
          },
          { label: "Hotel", ok: v.hotel_arranged, target: extraField(v.id, "hotel_arranged") },
        ]);
        push(p.id, p.name, p.responsible_seller_id, `${v.label} · departure`, v.departure_date, [
          {
            label: "Departure transfer",
            ok: v.departure_transfer_arranged,
            target: extraField(v.id, "departure_transfer_arranged"),
          },
        ]);
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [patients, todayIso]);

  const dayHeaderLabel = (daysLeft: number, date: string) =>
    daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${formatDate(date)} · in ${daysLeft} days`;

  const ScopeToggle = (
    <div className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5">
      {(["mine", "team"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setScope(s)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            scope === s ? "bg-teal-600 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {s === "mine" ? "Mine" : "Whole team"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Team operations</h2>
          <p className="text-xs text-slate-500">Arrivals, follow-ups, logistics and payments — applies to every card below.</p>
        </div>
        {ScopeToggle}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Upcoming events this month</h2>
            <Link href="/calendar" className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700">
              View calendar →
            </Link>
          </div>
          {dayGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No events scheduled this month.</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                let idx = 0;
                return dayGroups.map((g) => (
                  <div key={g.date}>
                    <p
                      className={`mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide ${
                        g.daysLeft <= 1 ? "text-red-500" : g.daysLeft <= 7 ? "text-amber-600" : "text-slate-400"
                      }`}
                    >
                      {dayHeaderLabel(g.daysLeft, g.date)}
                    </p>
                    <ul className="space-y-1">
                      {g.events.map((v, i) => (
                        <li key={i} className="animate-fade-in-up" style={{ animationDelay: `${idx++ * 40}ms` }}>
                          <Link
                            href={`/patients?q=${encodeURIComponent(v.patientName)}`}
                            className="flex items-center justify-between rounded-lg px-2 py-2 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${KIND_STYLES[v.kind]}`}
                              >
                                {EVENT_ICONS[v.kind]}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-slate-800">{v.patientName}</p>
                                <p className="text-xs text-slate-500">
                                  {v.label}
                                  {v.time ? ` · ${v.time}` : ""}
                                  {v.flightNo ? ` · ${v.flightNo}` : ""}
                                  {v.treatment ? ` · ${v.treatment}` : ""}
                                </p>
                                {scope === "team" && (
                                  <p className="text-xs text-slate-400">Responsible: {sellerName(v.responsibleSellerId)}</p>
                                )}
                              </div>
                            </div>
                            {v.expected != null && (
                              <span className="text-right text-sm font-medium text-slate-700">
                                {formatCurrency(v.expected, currency)}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ));
              })()}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Needs follow-up</h2>
              <p className="text-xs text-slate-500">Visit 1 done, visit 2 not booked yet</p>
            </div>
            {needsFollowUp.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {needsFollowUp.length}
              </span>
            )}
          </div>
          {needsFollowUp.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing needs follow-up ✓</p>
          ) : (
            <ul className="space-y-1">
              {needsFollowUp.map(({ patient: p, daysSince }, i) => (
                <li key={p.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link
                    href={`/patients?q=${encodeURIComponent(p.name)}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.treatment ? `${p.treatment} · ` : ""}Visit 1 completed {formatDate(p.visit1_date)}
                      </p>
                      {scope === "team" && (
                        <p className="text-xs text-slate-400">Responsible: {sellerName(p.responsible_seller_id)}</p>
                      )}
                    </div>
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Payment not logged</h2>
              <p className="text-xs text-slate-500">Visit passed, no actual amount recorded</p>
            </div>
            {paymentMismatches.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                {paymentMismatches.length}
              </span>
            )}
          </div>
          {paymentMismatches.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">All payments logged ✓</p>
          ) : (
            <ul className="space-y-1">
              {paymentMismatches.map((m, i) => (
                <li
                  key={`${m.patient.id}-${m.visitLabel}`}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    href={`/patients?q=${encodeURIComponent(m.patient.name)}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{m.patient.name}</p>
                      <p className="text-xs text-slate-500">
                        {m.visitLabel} · {formatDate(m.visitDate)}
                      </p>
                      {scope === "team" && (
                        <p className="text-xs text-slate-400">
                          Responsible: {sellerName(m.patient.responsible_seller_id)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="block text-sm font-medium text-slate-700">
                        {formatCurrency(m.expected, currency)}
                      </span>
                      <span
                        className={`block text-xs font-medium ${
                          m.daysSince >= 30 ? "text-red-500" : m.daysSince >= 14 ? "text-amber-600" : "text-slate-400"
                        }`}
                      >
                        {m.daysSince === 0 ? "Today" : m.daysSince === 1 ? "1 day ago" : `${m.daysSince} days ago`}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Logistics not arranged</h2>
              <p className="text-xs text-slate-500">Upcoming arrivals missing a transfer or hotel booking</p>
            </div>
            {logisticsNotArranged.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {logisticsNotArranged.length}
              </span>
            )}
          </div>
          {logisticsNotArranged.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing outstanding ✓</p>
          ) : (
            <ul className="space-y-1">
              {logisticsNotArranged.map((item, i) => (
                <li
                  key={`${item.patientId}-${item.label}`}
                  className="flex animate-fade-in-up items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50 hover:shadow-sm"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    href={`/patients?q=${encodeURIComponent(item.patientName)}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="text-sm font-medium text-slate-800">{item.patientName}</p>
                    <p className="text-xs text-slate-500">
                      {item.label} · {formatDate(item.date)}
                    </p>
                    {scope === "team" && (
                      <p className="text-xs text-slate-400">Responsible: {sellerName(item.responsibleSellerId)}</p>
                    )}
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    {item.badges.map((b) => {
                      const key = logisticsTargetKey(b.target);
                      const busy = busyTargetKey === key;
                      return (
                        <label
                          key={b.label}
                          title={`Mark ${b.label.toLowerCase()} as ${b.ok ? "not arranged" : "arranged"}`}
                          className={`flex select-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium ${
                            busy ? "cursor-wait opacity-50" : "cursor-pointer hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={b.ok}
                            disabled={busy}
                            onChange={() => handleToggleLogistics(b.target, !b.ok)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                          />
                          <span className={b.ok ? "text-emerald-700" : "text-amber-700"}>{b.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent patients</h2>
          <Link href="/patients" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 font-medium">Name</th>
                <th className="py-3 font-medium">Treatment</th>
                <th className="py-3 font-medium">Confirmed</th>
                <th className="py-3 font-medium">First visit</th>
                <th className="py-3 font-medium">Visit 2</th>
                {scope === "team" && <th className="py-3 font-medium">Responsible</th>}
                <th className="py-3 font-medium">Komo</th>
              </tr>
            </thead>
            <tbody>
              {patients.slice(0, 6).map((p, i) => (
                <tr key={p.id} className="animate-fade-in border-b border-slate-50 last:border-0" style={{ animationDelay: `${i * 40}ms` }}>
                  <td className="py-2.5 pl-4 font-medium text-slate-800">{p.name}</td>
                  <td className="py-2.5 text-slate-500">{p.treatment || "—"}</td>
                  <td className="py-2.5 text-slate-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-2.5 text-slate-500">
                    <div>{formatDate(p.visit1_date)}</div>
                    <StatusBadge status={p.visit1_status} />
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={p.visit2_status} />
                  </td>
                  {scope === "team" && (
                    <td className="py-2.5 text-slate-500">{sellerName(p.responsible_seller_id)}</td>
                  )}
                  <td className="py-2.5">
                    {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) ? (
                      <a
                        href={p.komo_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-teal-600 hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={scope === "team" ? 7 : 6} className="py-8 text-center text-slate-400">
                    No patients yet.{" "}
                    <Link href="/patients" className="text-teal-600 hover:underline">
                      Add your first patient
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-50 sm:hidden">
          {patients.slice(0, 6).map((p, i) => (
            <li key={p.id} className="animate-fade-in-up py-3" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.treatment || "—"}</p>
                  {scope === "team" && (
                    <p className="text-xs text-slate-400">Responsible: {sellerName(p.responsible_seller_id)}</p>
                  )}
                </div>
                {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) && (
                  <a
                    href={p.komo_reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-medium text-teal-600 hover:underline"
                  >
                    Komo ↗
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                <span>Confirmed {formatDate(p.confirmation_date)}</span>
                <span className="flex items-center gap-1.5">
                  V1 {formatDate(p.visit1_date)} <StatusBadge status={p.visit1_status} />
                </span>
                <span className="flex items-center gap-1.5">
                  V2 <StatusBadge status={p.visit2_status} />
                </span>
              </div>
            </li>
          ))}
          {patients.length === 0 && (
            <li className="py-8 text-center text-slate-400">
              No patients yet.{" "}
              <Link href="/patients" className="text-teal-600 hover:underline">
                Add your first patient
              </Link>
              .
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
