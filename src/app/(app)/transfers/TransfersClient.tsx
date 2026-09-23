"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { TransferWithPatient } from "@/lib/data";
import { driverDayMessage, driverMessage, isWhatsAppable, waDigits, waLink } from "@/lib/transfer-message";
import { Driver, TransferCompany, TransferKind, TransferStatus } from "@/types";
import { markTransferSent, markTransfersSent, setTransferStatus } from "../patients/transfer-actions";

const KIND: Record<TransferKind, { label: string; tone: "green" | "amber" | "slate" }> = {
  arrival: { label: "Arrival", tone: "green" },
  departure: { label: "Departure", tone: "amber" },
  local: { label: "Local", tone: "slate" },
};
const STATUS: Record<TransferStatus, { label: string; tone: "slate" | "blue" | "green" }> = {
  planned: { label: "Not sent", tone: "slate" },
  sent: { label: "Sent", tone: "blue" },
  done: { label: "Done", tone: "green" },
};

function dayLabel(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const tomorrow = (() => {
    const [ty, tm, td] = today.split("-").map(Number);
    const t = new Date(ty, tm - 1, td + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  return iso === today ? `Today · ${label}` : iso === tomorrow ? `Tomorrow · ${label}` : label;
}

type DriverGroup = { key: string; driver: Driver | null; company: TransferCompany | null; items: TransferWithPatient[] };

/** One day's transfers grouped by driver — unassigned first, since those need action. */
function groupByDriver(items: TransferWithPatient[], companies: TransferCompany[]): DriverGroup[] {
  const groups = new Map<string, DriverGroup>();
  for (const t of items) {
    const company = companies.find((c) => c.id === t.company_id) ?? null;
    const driver = company?.drivers.find((d) => d.id === t.driver_id) ?? null;
    const key = driver?.id ?? "none";
    if (!groups.has(key)) groups.set(key, { key, driver, company: driver ? company : null, items: [] });
    groups.get(key)!.items.push(t);
  }
  return [...groups.values()].sort((a, b) =>
    a.key === "none" ? -1 : b.key === "none" ? 1 : (a.driver?.name ?? "").localeCompare(b.driver?.name ?? "")
  );
}

/** Operations' daily sheet: every transfer across all patients for the chosen days, by
 * driver, with WhatsApp sends per transfer or for a driver's whole day. */
export function TransfersClient({
  transfers,
  companies,
  from,
  days,
  today,
  dates,
  prevDate,
  nextDate,
}: {
  transfers: TransferWithPatient[];
  companies: TransferCompany[];
  from: string;
  days: number;
  today: string;
  dates: string[];
  prevDate: string;
  nextDate: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const href = (date: string, d = days) => `/transfers?date=${date}&days=${d}`;
  const noDriver = transfers.filter((t) => !t.driver_id).length;
  const notSent = transfers.filter((t) => t.driver_id && t.status === "planned").length;

  function run(id: string, fn: () => Promise<void>, ok?: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await fn();
        if (ok) showToast(ok);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      } finally {
        setBusyId(null);
      }
    });
  }

  function sendOne(t: TransferWithPatient, phone: string) {
    // open first, straight from the click — browsers block a new tab opened after an await
    window.open(waLink(phone, driverMessage(t, t.patient.name, t.patient.phone)), "_blank", "noopener,noreferrer");
    run(t.id, () => markTransferSent(t.id));
  }

  function sendDay(group: DriverGroup, date: string) {
    if (!group.driver?.phone) return;
    const text = driverDayMessage(
      date,
      group.items.map((t) => ({ transfer: t, patientName: t.patient.name, patientPhone: t.patient.phone }))
    );
    window.open(waLink(group.driver.phone, text), "_blank", "noopener,noreferrer");
    run(`${group.key}-${date}`, () => markTransfersSent(group.items.filter((t) => t.status !== "done").map((t) => t.id)));
  }

  const rangeButton = (d: number, label: string) => (
    <Link
      key={d}
      href={href(from, d)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Transfers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every car journey across all patients, by driver.{" "}
            {noDriver > 0 && <span className="font-medium text-amber-700">{noDriver} without a driver. </span>}
            {notSent > 0 && <span className="font-medium text-slate-700">{notSent} not sent to the driver yet.</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link href={href(prevDate)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200" aria-label="Earlier">
              ‹
            </Link>
            <Link
              href={href(today)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${from === today ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Today
            </Link>
            <input
              type="date"
              value={from}
              onChange={(e) => e.target.value && router.push(href(e.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700"
              aria-label="Start date"
            />
            <Link href={href(nextDate)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200" aria-label="Later">
              ›
            </Link>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {rangeButton(1, "1 day")}
            {rangeButton(2, "2 days")}
            {rangeButton(7, "Week")}
          </div>
        </div>
      </div>

      {dates.map((date) => {
        const dayItems = transfers.filter((t) => t.transfer_date === date);
        return (
          <section key={date} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {dayLabel(date, today)} <span className="font-normal normal-case text-slate-400">· {dayItems.length} transfer{dayItems.length === 1 ? "" : "s"}</span>
            </h2>
            {dayItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">No transfers.</p>
            ) : (
              groupByDriver(dayItems, companies).map((g) => (
                <Card key={g.key} className={`overflow-hidden ${g.driver ? "" : "ring-2 ring-amber-300"}`}>
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${
                      g.driver ? "border-slate-100 bg-slate-50/60" : "border-amber-100 bg-amber-50"
                    }`}
                  >
                    {g.driver ? (
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{g.driver.name}</p>
                        <p className="text-xs text-slate-500">
                          {[g.company?.is_internal ? "Clinic" : g.company?.name, g.driver.vehicle, g.driver.phone].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    ) : (
                      <p className="font-semibold text-amber-800">⚠ No driver yet — open the patient to assign one</p>
                    )}
                    {g.driver && (
                      <button
                        type="button"
                        onClick={() => sendDay(g, date)}
                        disabled={!isWhatsAppable(g.driver.phone) || pending}
                        title={isWhatsAppable(g.driver.phone) ? "One WhatsApp message with all of this driver's transfers for the day" : "This driver has no phone number"}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyId === `${g.key}-${date}` ? "Sending…" : `WhatsApp day list (${g.items.length})`}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((t) => (
                      <li key={t.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 text-sm ${t.status === "done" ? "opacity-60" : ""}`}>
                        <div className="w-14 shrink-0 text-base font-semibold tabular-nums text-slate-900">{t.transfer_time ?? "--:--"}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Badge>
                            <span className="font-medium text-slate-800">
                              {t.from_place || "?"} → {t.to_place || "?"}
                            </span>
                            <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                            <Link href={`/patients/${t.patient.id}`} className="font-medium text-teal-700 hover:underline">
                              {t.patient.name}
                            </Link>
                            <span>{t.pax} pax</span>
                            {t.flight_no && <span>✈ {t.flight_no}</span>}
                            {t.patient.phone && (
                              <>
                                <a href={`tel:${t.patient.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                                  📞 {t.patient.phone}
                                </a>
                                {waDigits(t.patient.phone).length >= 8 && (
                                  <a
                                    href={`https://wa.me/${waDigits(t.patient.phone)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 hover:underline"
                                  >
                                    WhatsApp patient
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                          {t.notes && <p className="mt-0.5 text-xs text-slate-400">{t.notes}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
                          {g.driver && t.status !== "done" && (
                            <button
                              type="button"
                              onClick={() => g.driver?.phone && sendOne(t, g.driver.phone)}
                              disabled={!isWhatsAppable(g.driver.phone) || busyId === t.id}
                              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                            >
                              {t.status === "planned" ? "WhatsApp" : "Resend"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => run(t.id, () => setTransferStatus(t.id, t.status === "done" ? "sent" : "done"), t.status === "done" ? "Marked not done" : "Marked done ✓")}
                            disabled={busyId === t.id}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                          >
                            {t.status === "done" ? "Undo" : "Done ✓"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
