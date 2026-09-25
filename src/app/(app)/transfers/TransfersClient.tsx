"use client";

import { DateInput } from "@/components/DateInput";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { TransferWithPatient } from "@/lib/data";
import { driverDayMessage, driverMessage, isWhatsAppable, waDigits } from "@/lib/transfer-message";
import { DriverSend, DriverMessagesOffHint, FallbackLink, sendLabel, useDriverMessages, WhatsAppDelivery } from "@/components/driver-messages";
import { Driver, DriverMessagesMode, TransferCompany, TransferKind, TransferStatus } from "@/types";
import { markTransferSent, markTransfersSent, setTransferStatus } from "../patients/transfer-actions";
import { PeopleFilter, isAllFilter, matchesPeopleFilter } from "@/lib/people-filter";
import { PeopleFilterBar, PersonOption } from "@/components/PeopleFilterBar";

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

/** One transfer detail: labelled on phones (two to a row, or a full row when `wide`), a plain
 * inline value on wider screens where the row has room. */
function Detail({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:hidden">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
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
  driverMessages,
  isAdmin,
  from,
  days,
  today,
  dates,
  prevDate,
  nextDate,
  sellers,
  coordinators,
  initialFilter,
  savedFilter,
  currentUserId,
}: {
  transfers: TransferWithPatient[];
  companies: TransferCompany[];
  driverMessages: DriverMessagesMode;
  isAdmin: boolean;
  from: string;
  days: number;
  today: string;
  dates: string[];
  prevDate: string;
  nextDate: string;
  sellers: PersonOption[];
  coordinators: PersonOption[];
  initialFilter: PeopleFilter;
  savedFilter: PeopleFilter;
  currentUserId: string;
}) {
  const [people, setPeople] = useState<PeopleFilter>(initialFilter);
  // the filter narrows what is listed; a driver's whole-day message below always covers all
  // of their transfers, whatever the filter, so a driver never gets half a day
  const shown = transfers.filter((t) => matchesPeopleFilter(t.patient, people, currentUserId));
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const messages = useDriverMessages(driverMessages);

  const href = (date: string, d = days) => `/transfers?date=${date}&days=${d}`;
  const noDriver = shown.filter((t) => !t.driver_id).length;
  const notSent = shown.filter((t) => t.driver_id && t.status === "planned").length;

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

  function oneSend(t: TransferWithPatient, driver: Driver): DriverSend {
    return {
      key: t.id,
      transferIds: [t.id],
      driverName: driver.name,
      driverPhone: driver.phone ?? "",
      text: driverMessage(t, t.patient.name, t.patient.phone),
      markSent: () => markTransferSent(t.id),
    };
  }

  /** The driver's whole day in one message — the transfers still to do. */
  function daySend(group: DriverGroup, date: string): DriverSend {
    const open = transfers.filter((t) => t.transfer_date === date && t.driver_id === group.key && t.status !== "done");
    return {
      key: `${group.key}-${date}`,
      transferIds: open.map((t) => t.id),
      driverName: group.driver?.name ?? "",
      driverPhone: group.driver?.phone ?? "",
      text: driverDayMessage(
        date,
        open.map((t) => ({ transfer: t, patientName: t.patient.name, patientPhone: t.patient.phone }))
      ),
      markSent: () => markTransfersSent(open.map((t) => t.id)),
    };
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
          {driverMessages === "off" && isAdmin && (
            <div className="mt-1">
              <DriverMessagesOffHint />
            </div>
          )}
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
            <DateInput value={from} onChange={(iso) => iso && router.push(href(iso))} className="w-40" aria-label="Start date" />
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

      <PeopleFilterBar
        page="transfers"
        value={people}
        onChange={setPeople}
        sellers={sellers}
        coordinators={coordinators}
        savedDefault={savedFilter}
        currentUserId={currentUserId}
      />
      {!isAllFilter(people) && (
        <p className="-mt-3 text-xs text-slate-500">
          Showing only the filtered patients&apos; transfers. A driver&apos;s day list still includes all of their transfers.
        </p>
      )}

      {dates.map((date) => {
        const dayItems = shown.filter((t) => t.transfer_date === date);
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
                    {g.driver && (() => {
                      const day = daySend(g, date);
                      const fallbackUrl = messages.fallbackUrl(day.key);
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => messages.copy(day.text)}
                            disabled={day.transferIds.length === 0}
                            className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
                          >
                            Copy day list
                          </button>
                          {driverMessages !== "off" &&
                            (fallbackUrl ? (
                              <FallbackLink url={fallbackUrl} onUse={() => messages.sentViaFallback(day)} />
                            ) : (
                              <button
                                type="button"
                                onClick={() => messages.send(day)}
                                disabled={!isWhatsAppable(g.driver.phone) || pending || day.transferIds.length === 0 || messages.busyKey === day.key}
                                title={
                                  !isWhatsAppable(g.driver.phone)
                                    ? "This driver has no phone number"
                                    : driverMessages === "api"
                                    ? "Sends all of this driver's open transfers for the day from the clinic's WhatsApp number"
                                    : "One WhatsApp message with all of this driver's open transfers for the day"
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {messages.busyKey === day.key
                                  ? "Sending…"
                                  : `${driverMessages === "api" ? "Send" : "WhatsApp"} day list (${day.transferIds.length})`}
                              </button>
                            ))}
                        </div>
                      );
                    })()}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((t) => (
                      <li key={t.id} className={`px-4 py-3 text-sm ${t.status === "done" ? "opacity-60" : ""}`}>
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
                          {/* time — on phones with the badges beside it */}
                          <div className="flex items-center gap-2 sm:w-14 sm:shrink-0">
                            <span className="text-lg font-semibold tabular-nums text-slate-900 sm:text-base">{t.transfer_time ?? "--:--"}</span>
                            <span className="ml-auto flex flex-wrap justify-end gap-1.5 sm:hidden">
                              <Badge tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Badge>
                              <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                            </span>
                          </div>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="hidden sm:inline-flex">
                                <Badge tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Badge>
                              </span>
                              <span className="text-[15px] font-semibold text-slate-900 sm:text-sm sm:font-medium sm:text-slate-800">
                                {t.from_place || "?"} → {t.to_place || "?"}
                              </span>
                              <span className="hidden sm:inline-flex">
                                <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                              </span>
                              <WhatsAppDelivery transfer={t} />
                            </div>

                            {/* details — a labelled grid on phones, one compact line on wider screens */}
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:text-xs sm:text-slate-600">
                              <Detail label="Patient" wide>
                                <Link href={`/patients/${t.patient.id}`} className="font-semibold text-teal-700 hover:underline sm:font-medium">
                                  {t.patient.name}
                                </Link>
                              </Detail>
                              <Detail label="Pax">{t.pax} pax</Detail>
                              {t.flight_no && <Detail label="Flight">✈ {t.flight_no}</Detail>}
                              {t.patient.phone && (
                                <Detail label="Patient phone" wide>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <a href={`tel:${t.patient.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-slate-800 hover:underline sm:font-normal sm:text-slate-600">
                                      📞 {t.patient.phone}
                                    </a>
                                    {waDigits(t.patient.phone).length >= 8 && (
                                      <a
                                        href={`https://wa.me/${waDigits(t.patient.phone)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 sm:bg-transparent sm:p-0 sm:font-normal sm:hover:underline"
                                      >
                                        WhatsApp patient
                                      </a>
                                    )}
                                  </span>
                                </Detail>
                              )}
                              {t.notes && (
                                <Detail label="Notes" wide>
                                  <span className="text-slate-700 sm:text-slate-400">{t.notes}</span>
                                </Detail>
                              )}
                            </dl>
                          </div>

                          {/* actions — full-width buttons on phones */}
                          <div className="flex gap-2 text-sm font-medium sm:shrink-0 sm:text-xs [&>*]:flex-1 [&>*]:text-center sm:[&>*]:flex-none">
                            {g.driver && (
                              <button
                                type="button"
                                onClick={() => messages.copy(driverMessage(t, t.patient.name, t.patient.phone))}
                                className="rounded-lg bg-slate-100 px-2.5 py-2 text-slate-700 hover:bg-slate-200 sm:py-1"
                                title="Copy the driver message to paste anywhere"
                              >
                                Copy
                              </button>
                            )}
                            {g.driver && t.status !== "done" && driverMessages !== "off" && (() => {
                              const one = oneSend(t, g.driver);
                              const fallbackUrl = messages.fallbackUrl(one.key);
                              return fallbackUrl ? (
                                <FallbackLink url={fallbackUrl} onUse={() => messages.sentViaFallback(one)} />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => messages.send(one)}
                                  disabled={!isWhatsAppable(g.driver.phone) || busyId === t.id || messages.busyKey === t.id}
                                  className="rounded-lg bg-emerald-50 px-2.5 py-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 sm:py-1"
                                >
                                  {messages.busyKey === t.id ? "Sending…" : sendLabel(driverMessages, t.status !== "planned")}
                                </button>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => run(t.id, () => setTransferStatus(t.id, t.status === "done" ? "sent" : "done"), t.status === "done" ? "Marked not done" : "Marked done ✓")}
                              disabled={busyId === t.id}
                              className="rounded-lg bg-slate-100 px-2.5 py-2 text-slate-700 hover:bg-slate-200 disabled:opacity-40 sm:py-1"
                            >
                              {t.status === "done" ? "Undo" : "Done ✓"}
                            </button>
                          </div>
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
