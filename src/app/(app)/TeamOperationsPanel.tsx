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
import { MoneyPatient, Seller } from "@/types";
import { sellerLabel } from "@/lib/sellers";
import { isMismatch, visitBalances } from "@/lib/balance";
import { visitExpectedTotal } from "@/lib/commission";
import { useModule } from "@/components/permissions";
import { useT } from "@/i18n/client";


const EVENT_ICONS: Record<CalendarEventKind, string> = {
  visit1_arrival: "🛬",
  visit1_departure: "🛫",
  visit2_arrival: "🛬",
  visit2_departure: "🛫",
  visit1_self: "📍",
  visit2_self: "📍",
  extra_visit: "🦷",
};

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
  /** In the patient's deal currency. */
  expected: number | null;
  currency: string;
};

type LogisticsTarget =
  | { scope: "patient"; id: string; field: PatientLogisticsField }
  | { scope: "extra"; id: string; field: ExtraVisitLogisticsField };

/** `target` null = a transfer, which isn't ticked by hand: it counts as arranged once the
 * visit has that transfer with a driver, so the badge links to the patient page instead. */
type LogisticsBadge = { label: string; ok: boolean; target: LogisticsTarget | null };

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
  patient: MoneyPatient;
  visitLabel: string;
  visitDate: string | null;
  /** owed − paid: positive = still due, negative = overpaid */
  due: number;
  daysSince: number | null;
};

/** Everything here is operational (arrivals, follow-ups, logistics, unpaid amounts) — none of
 * it reveals commission, which is computed from each seller's own private tier rates. So it's
 * safe to show any part of the shared roster here, same as /patients and /calendar already
 * do. The dashboard's Seller / Coordinator filter decides which patients come in; this panel
 * adds a "Responsible: X" label whenever that can be someone other than the viewer. */
export function TeamOperationsPanel({
  patients,
  showResponsible,
  sellers,
  todayIso,
  monthAheadIso,
}: {
  /** Already narrowed by the dashboard's filter. */
  patients: MoneyPatient[];
  showResponsible: boolean;
  sellers: Seller[];
  todayIso: string;
  monthAheadIso: string;
}) {
  // flights, hotels and transfers are the Operations module
  const operations = useModule("operations");
  const [busyTargetKey, setBusyTargetKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();
  const t = useT();

  function handleToggleLogistics(target: LogisticsTarget, value: boolean) {
    const key = logisticsTargetKey(target);
    setBusyTargetKey(key);
    startTransition(async () => {
      try {
        if (target.scope === "patient") await setPatientLogisticsFlag(target.id, target.field, value);
        else await setExtraVisitLogisticsFlag(target.id, target.field, value);
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Failed to update"), "error");
      } finally {
        setBusyTargetKey(null);
      }
    });
  }

  const sellerName = useMemo(() => {
    const map = new Map(sellers.map((s) => [s.id, sellerLabel(s)]));
    return (id: string) => map.get(id) ?? t("Unknown");
  }, [sellers, t]);

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
        currency: p.currency,
        // Departure shares the same expected amount as its arrival — showing it twice per visit
        // reads as double the money owed, so only the arrival (or self/extra) event carries it.
        // price + that visit's extras
        expected: isDeparture
          ? null
          : isExtra
            ? extraVisit
              ? visitExpectedTotal(p, extraVisit.id, extraVisit.expected)
              : null
            : isVisit2
              ? visitExpectedTotal(p, "visit2", p.visit2_expected)
              : visitExpectedTotal(p, "visit1", p.visit1_expected),
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

  // Visits whose money doesn't add up: already happened and still owed something (expected +
  // extras vs payments), or overpaid. A zero-owed visit (e.g. a comped extra visit) never shows.
  const paymentMismatches = useMemo(() => {
    const list: PaymentMismatch[] = [];
    for (const p of patients) {
      for (const b of visitBalances(p)) {
        if (!isMismatch(b, todayIso)) continue;
        const daysSince = b.date
          ? Math.round((new Date(todayIso).getTime() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        list.push({ patient: p, visitLabel: b.label, visitDate: b.date, due: b.due, daysSince });
      }
    }
    list.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));
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
      push(p.id, p.name, p.responsible_seller_id, `${t("Visit 1")} · ${t("arrival")}`, p.visit1_arrival_date, [
        { label: t("Arrival transfer"), ok: p.visit1_arrival_transfer_arranged, target: null },
        { label: t("Hotel"), ok: p.visit1_hotel_arranged, target: patientField(p.id, "visit1_hotel_arranged") },
      ]);
      push(p.id, p.name, p.responsible_seller_id, `${t("Visit 1")} · ${t("departure")}`, p.visit1_departure_date, [
        { label: t("Departure transfer"), ok: p.visit1_departure_transfer_arranged, target: null },
      ]);
      if (p.needs_visit2) {
        push(p.id, p.name, p.responsible_seller_id, `${t("Visit 2")} · ${t("arrival")}`, p.visit2_arrival_date, [
          { label: t("Arrival transfer"), ok: p.visit2_arrival_transfer_arranged, target: null },
          { label: t("Hotel"), ok: p.visit2_hotel_arranged, target: patientField(p.id, "visit2_hotel_arranged") },
        ]);
        push(p.id, p.name, p.responsible_seller_id, `${t("Visit 2")} · ${t("departure")}`, p.visit2_departure_date, [
          { label: t("Departure transfer"), ok: p.visit2_departure_transfer_arranged, target: null },
        ]);
      }
      for (const v of p.extra_visits) {
        push(p.id, p.name, p.responsible_seller_id, `${t(v.label)} · ${t("arrival")}`, v.arrival_date, [
          { label: t("Arrival transfer"), ok: v.arrival_transfer_arranged, target: null },
          { label: t("Hotel"), ok: v.hotel_arranged, target: extraField(v.id, "hotel_arranged") },
        ]);
        push(p.id, p.name, p.responsible_seller_id, `${t(v.label)} · ${t("departure")}`, v.departure_date, [
          { label: t("Departure transfer"), ok: v.departure_transfer_arranged, target: null },
        ]);
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [patients, todayIso, t]);

  const dayHeaderLabel = (daysLeft: number, date: string) =>
    daysLeft === 0 ? t("Today") : daysLeft === 1 ? t("Tomorrow") : t("{date} · in {n} days", { date: formatDate(date), n: daysLeft });
  const ago = (days: number) => (days === 0 ? t("Today") : days === 1 ? t("1 day ago") : t("{n} days ago", { n: days }));
  const responsible = (id: string) => t("Responsible: {name}", { name: sellerName(id) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t("Team operations")}</h2>
          <p className="text-xs text-slate-500">{t("Arrivals, follow-ups, logistics and payments — applies to every card below.")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t("Upcoming events this month")}</h2>
            <Link href="/calendar" className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700">
              {t("View calendar")} →
            </Link>
          </div>
          {dayGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("No events scheduled this month.")}</p>
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
                            href={`/patients/${v.patientId}`}
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
                                  {t(v.label)}
                                  {v.time ? ` · ${v.time}` : ""}
                                  {v.flightNo ? ` · ${v.flightNo}` : ""}
                                  {v.treatment ? ` · ${v.treatment}` : ""}
                                </p>
                                {showResponsible && (
                                  <p className="text-xs text-slate-400">{responsible(v.responsibleSellerId)}</p>
                                )}
                              </div>
                            </div>
                            {v.expected != null && (
                              <span className="text-right text-sm font-medium text-slate-700">
                                {formatCurrency(v.expected, v.currency)}
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
              <h2 className="text-base font-semibold text-slate-900">{t("Needs follow-up")}</h2>
              <p className="text-xs text-slate-500">{t("Visit 1 done, visit 2 not booked yet")}</p>
            </div>
            {needsFollowUp.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {needsFollowUp.length}
              </span>
            )}
          </div>
          {needsFollowUp.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("Nothing needs follow-up ✓")}</p>
          ) : (
            <ul className="space-y-1">
              {needsFollowUp.map(({ patient: p, daysSince }, i) => (
                <li key={p.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link
                    href={`/patients/${p.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.treatment ? `${p.treatment} · ` : ""}{t("Visit 1 completed {date}", { date: formatDate(p.visit1_date) })}
                      </p>
                      {showResponsible && (
                        <p className="text-xs text-slate-400">{responsible(p.responsible_seller_id)}</p>
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
                      {daysSince == null ? "—" : ago(daysSince)}
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
              <h2 className="text-base font-semibold text-slate-900">{t("Payments don't match")}</h2>
              <p className="text-xs text-slate-500">{t("Paid into, completed or past its date — and still short (price + extras), or overpaid")}</p>
            </div>
            {paymentMismatches.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                {paymentMismatches.length}
              </span>
            )}
          </div>
          {paymentMismatches.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("Every visit is paid in full ✓")}</p>
          ) : (
            <ul className="space-y-1">
              {paymentMismatches.map((m, i) => (
                <li
                  key={`${m.patient.id}-${m.visitLabel}`}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    href={`/patients/${m.patient.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{m.patient.name}</p>
                      <p className="text-xs text-slate-500">
                        {t(m.visitLabel)}
                        {m.visitDate ? ` · ${formatDate(m.visitDate)}` : ""}
                      </p>
                      {showResponsible && (
                        <p className="text-xs text-slate-400">
                          {responsible(m.patient.responsible_seller_id)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`block text-sm font-medium ${m.due > 0 ? "text-slate-700" : "text-blue-700"}`}>
                        {m.due > 0
                          ? t("{amount} due", { amount: formatCurrency(m.due, m.patient.currency) })
                          : t("Overpaid {amount}", { amount: formatCurrency(-m.due, m.patient.currency) })}
                      </span>
                      {m.daysSince != null && (
                        <span
                          className={`block text-xs font-medium ${
                            m.daysSince >= 30 ? "text-red-500" : m.daysSince >= 14 ? "text-amber-600" : "text-slate-400"
                          }`}
                        >
                          {ago(m.daysSince)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {operations && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{t("Logistics not arranged")}</h2>
              <p className="text-xs text-slate-500">{t("Upcoming arrivals missing a transfer or hotel booking")}</p>
            </div>
            {logisticsNotArranged.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {logisticsNotArranged.length}
              </span>
            )}
          </div>
          {logisticsNotArranged.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("Nothing outstanding ✓")}</p>
          ) : (
            <ul className="space-y-1">
              {logisticsNotArranged.map((item, i) => (
                <li
                  key={`${item.patientId}-${item.label}`}
                  className="flex animate-fade-in-up items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50 hover:shadow-sm"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    href={`/patients/${item.patientId}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="text-sm font-medium text-slate-800">{item.patientName}</p>
                    <p className="text-xs text-slate-500">
                      {item.label} · {formatDate(item.date)}
                    </p>
                    {showResponsible && (
                      <p className="text-xs text-slate-400">{responsible(item.responsibleSellerId)}</p>
                    )}
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    {item.badges.map((b) => {
                      if (!b.target) {
                        return (
                          <Link
                            key={b.label}
                            href={`/patients/${item.patientId}`}
                            title={b.ok ? t("Transfer has a driver") : t("Add the transfer and pick a driver")}
                            className={`rounded-md px-1 py-0.5 text-xs font-medium hover:bg-slate-100 ${
                              b.ok ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {b.ok ? "✓" : "＋"} {b.label}
                          </Link>
                        );
                      }
                      const target = b.target;
                      const key = logisticsTargetKey(target);
                      const busy = busyTargetKey === key;
                      return (
                        <label
                          key={b.label}
                          title={b.ok ? t("Mark {what} as not arranged", { what: b.label }) : t("Mark {what} as arranged", { what: b.label })}
                          className={`flex select-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium ${
                            busy ? "cursor-wait opacity-50" : "cursor-pointer hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={b.ok}
                            disabled={busy}
                            onChange={() => handleToggleLogistics(target, !b.ok)}
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
        )}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t("Recent patients")}</h2>
          <Link href="/patients" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            {t("View all")} →
          </Link>
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 font-medium">{t("Name")}</th>
                <th className="py-3 font-medium">{t("Treatment")}</th>
                <th className="py-3 font-medium">{t("Confirmed")}</th>
                <th className="py-3 font-medium">{t("First visit")}</th>
                <th className="py-3 font-medium">{t("Visit 2")}</th>
                {showResponsible && <th className="py-3 font-medium">{t("Responsible")}</th>}
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
                  {showResponsible && (
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
                        {t("Open")} ↗
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={showResponsible ? 7 : 6} className="py-8 text-center text-slate-400">
                    {t("No patients yet.")}{" "}
                    <Link href="/patients" className="text-teal-600 hover:underline">
                      {t("Add your first patient")}
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
                  {showResponsible && (
                    <p className="text-xs text-slate-400">{responsible(p.responsible_seller_id)}</p>
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
                <span>{t("Confirmed {date}", { date: formatDate(p.confirmation_date) })}</span>
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
              {t("No patients yet.")}{" "}
              <Link href="/patients" className="text-teal-600 hover:underline">
                {t("Add your first patient")}
              </Link>
              .
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
