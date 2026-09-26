"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { PatientRoster, Seller } from "@/types";
import { sellerLabel } from "@/lib/sellers";
import { Button, Card } from "@/components/ui";
import { PeopleFilter, matchesPeopleFilter, sellerFilterOptions } from "@/lib/people-filter";
import { PeopleFilterBar, PersonOption } from "@/components/PeopleFilterBar";
import { CalendarEvent, KIND_STYLES, flattenCalendarEvents, groupEventsByDate } from "@/lib/calendar-events";
import { useDateFnsLocale, useT } from "@/i18n/client";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MAX_VISIBLE = 3;

export function CalendarClient({
  month,
  patients,
  sellers,
  sellerIdsWithPatients,
  coordinators,
  initialFilter,
  savedFilter,
  currentUserId,
}: {
  /** The month shown (YYYY-MM). `patients` are those with an event on its grid. */
  month: string;
  patients: PatientRoster[];
  sellers: Seller[];
  /** Sellers responsible for at least one patient, in any month. */
  sellerIdsWithPatients: string[];
  coordinators: PersonOption[];
  initialFilter: PeopleFilter;
  savedFilter: PeopleFilter;
  currentUserId: string;
}) {
  const t = useT();
  const locale = useDateFnsLocale();
  const sellerName = useMemo(() => {
    const map = new Map(sellers.map((s) => [s.id, sellerLabel(s)]));
    return (id: string) => map.get(id) ?? t("Unknown");
  }, [sellers, t]);

  const [people, setPeople] = useState<PeopleFilter>(initialFilter);

  // Only sellers who actually have a patient here — no point listing an empty roster.
  const sellerOptions = useMemo(() => {
    const ids = new Set([...sellerIdsWithPatients, ...people.sellers]);
    return sellerFilterOptions(sellers).filter((s) => ids.has(s.id));
  }, [sellerIdsWithPatients, sellers, people.sellers]);

  // the month lives in the URL: another month is loaded from the server
  const router = useRouter();
  const [loading, startLoading] = useTransition();
  const cursor = useMemo(() => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), [month]);
  const setCursor = (next: (c: Date) => Date) =>
    startLoading(() => router.push(`/calendar?month=${format(next(cursor), "yyyy-MM")}`, { scroll: false }));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const filteredPatients = useMemo(
    () => patients.filter((p) => matchesPeopleFilter(p, people, currentUserId)),
    [patients, people, currentUserId]
  );

  const events = useMemo(() => flattenCalendarEvents(filteredPatients), [filteredPatients]);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const selectedEvents = selectedDate ? eventsByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [] : [];

  const agendaDays = useMemo(() => {
    const monthDays = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
    return monthDays.filter((d) => (eventsByDate.get(format(d, "yyyy-MM-dd"))?.length ?? 0) > 0);
  }, [cursor, eventsByDate]);

  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("Calendar")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Visits, arrivals and departures at a glance.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>
            ←
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium text-slate-700">
            {format(cursor, "LLLL yyyy", { locale })}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
            →
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCursor(() => startOfMonth(new Date()));
              setSelectedDate(new Date());
            }}
          >
            {t("Today")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <LegendDot className="bg-emerald-100" label={t("Arrival (V1)")} />
          <LegendDot className="bg-amber-100" label={t("Departure (V1)")} />
          <LegendDot className="bg-blue-100" label={t("Arrival (V2)")} />
          <LegendDot className="bg-purple-100" label={t("Departure (V2)")} />
          <LegendDot className="bg-slate-200" label={t("Visit (self-arranged)")} />
        </div>
        <PeopleFilterBar
          page="calendar"
          value={people}
          onChange={setPeople}
          sellers={sellerOptions}
          coordinators={coordinators}
          savedDefault={savedFilter}
          currentUserId={currentUserId}
        />
      </div>

      <div className="space-y-3 md:hidden">
        {agendaDays.length === 0 ? (
          <Card className="p-5 text-center text-sm text-slate-400">{t("No events this month.")}</Card>
        ) : (
          agendaDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(key) ?? [];
            return (
              <Card key={key} className="p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {format(day, "EEEE, d MMMM", { locale })}
                  {isToday(day) && (
                    <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">
                      {t("Today")}
                    </span>
                  )}
                </h3>
                <ul className="divide-y divide-slate-50">
                  {dayEvents.map((e, i) => (
                    <EventRow key={i} event={e} sellerName={sellerName(e.responsibleSellerId)} />
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-400">
          {(locale ? WEEKDAYS_TR : WEEKDAYS).map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const selected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(day)}
                className={`min-h-[100px] border-b border-r border-slate-100 p-1.5 text-left align-top last:border-r-0 hover:bg-slate-50 ${
                  inMonth ? "bg-white" : "bg-slate-50/40"
                } ${selected ? "ring-2 ring-inset ring-teal-500" : ""}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday(day) ? "bg-teal-600 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-300"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE).map((e, i) => (
                    <div
                      key={i}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${KIND_STYLES[e.kind]}`}
                      title={`${t(e.label)} · ${e.patientName}${e.time ? ` · ${e.time}` : ""}${e.treatment ? ` · ${e.treatment}` : ""} · ${t("Responsible: {name}", { name: sellerName(e.responsibleSellerId) })}`}
                    >
                      {e.time ? `${e.time} ` : ""}
                      {e.patientName}
                      {e.treatment ? ` · ${e.treatment}` : ""}
                    </div>
                  ))}
                  {dayEvents.length > MAX_VISIBLE && (
                    <div className="px-1 text-[10px] text-slate-400">{t("+{n} more", { n: dayEvents.length - MAX_VISIBLE })}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="hidden p-5 md:block">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {selectedDate
            ? format(selectedDate, "EEEE, d MMMM yyyy", { locale })
            : t("Events in {month}", { month: format(cursor, "LLLL yyyy", { locale }) })}
        </h2>
        {selectedDate ? (
          selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-400">{t("Nothing scheduled.")}</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {selectedEvents.map((e, i) => (
                <EventRow key={i} event={e} sellerName={sellerName(e.responsibleSellerId)} />
              ))}
            </ul>
          )
        ) : agendaDays.length === 0 ? (
          <p className="text-sm text-slate-400">{t("No events this month.")}</p>
        ) : (
          <div className="space-y-4">
            {agendaDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(key) ?? [];
              return (
                <div key={key}>
                  <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {format(day, "EEEE, d MMM", { locale })}
                    {isToday(day) && (
                      <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        {t("Today")}
                      </span>
                    )}
                  </h3>
                  <ul className="divide-y divide-slate-50">
                    {dayEvents.map((e, i) => (
                      <EventRow key={i} event={e} sellerName={sellerName(e.responsibleSellerId)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function EventRow({ event, sellerName }: { event: CalendarEvent; sellerName: string }) {
  const t = useT();
  const details = [event.treatment, event.time, event.flightNo, event.hotelName, event.roomType].filter(Boolean);
  return (
    <li className="py-3">
      <Link
        href={`/patients/${event.patientId}`}
        className="flex items-center justify-between gap-4 rounded-lg px-2 py-1 hover:bg-slate-50"
      >
        <div>
          <p className="text-sm font-medium text-slate-800">{event.patientName}</p>
          <p className="text-xs text-slate-500">{details.join(" · ") || "—"}</p>
          <p className="text-xs text-slate-400">{t("Responsible: {name}", { name: sellerName })}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_STYLES[event.kind]}`}>
          {t(event.label)}
        </span>
      </Link>
    </li>
  );
}
