import { Patient } from "@/types";

export type CalendarEventKind =
  | "visit1_arrival"
  | "visit1_departure"
  | "visit2_arrival"
  | "visit2_departure"
  | "visit1_self"
  | "visit2_self"
  | "extra_visit";

export interface CalendarEvent {
  date: string; // ISO date, YYYY-MM-DD
  patientId: string;
  patientName: string;
  treatment: string | null;
  kind: CalendarEventKind;
  label: string;
  time: string | null;
  flightNo: string | null;
  hotelName: string | null;
  roomType: string | null;
  /** Set only for kind "extra_visit" — id into that patient's extra_visits[], to look up status/expected. */
  extraVisitId: string | null;
}

const KIND_LABELS: Record<CalendarEventKind, string> = {
  visit1_arrival: "Arrival (V1)",
  visit1_departure: "Departure (V1)",
  visit2_arrival: "Arrival (V2)",
  visit2_departure: "Departure (V2)",
  visit1_self: "Visit (V1)",
  visit2_self: "Visit (V2)",
  extra_visit: "Extra visit",
};

export function eventLabel(kind: CalendarEventKind): string {
  return KIND_LABELS[kind];
}

/** Shared color classes for event kinds — keeps calendar and dashboard visually consistent. */
export const KIND_STYLES: Record<CalendarEventKind, string> = {
  visit1_arrival: "bg-emerald-100 text-emerald-700",
  visit1_departure: "bg-amber-100 text-amber-700",
  visit2_arrival: "bg-blue-100 text-blue-700",
  visit2_departure: "bg-purple-100 text-purple-700",
  visit1_self: "bg-slate-200 text-slate-700",
  visit2_self: "bg-slate-200 text-slate-700",
  extra_visit: "bg-rose-100 text-rose-700",
};

/** Flattens every dated field across all patients (clinic visits + flight legs) into one event list. */
export function flattenCalendarEvents(patients: Patient[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const p of patients) {
    const base = { patientId: p.id, patientName: p.name, treatment: p.treatment };

    if (p.visit1_arrival_date) {
      events.push({
        ...base,
        date: p.visit1_arrival_date,
        kind: "visit1_arrival",
        label: KIND_LABELS.visit1_arrival,
        time: p.visit1_arrival_time,
        flightNo: p.visit1_arrival_flight_no,
        hotelName: p.visit1_hotel_name,
        roomType: p.visit1_room_type,
        extraVisitId: null,
      });
    }
    if (p.visit1_departure_date) {
      events.push({
        ...base,
        date: p.visit1_departure_date,
        kind: "visit1_departure",
        label: KIND_LABELS.visit1_departure,
        time: p.visit1_departure_time,
        flightNo: p.visit1_departure_flight_no,
        hotelName: p.visit1_hotel_name,
        roomType: p.visit1_room_type,
        extraVisitId: null,
      });
    }
    if (!p.visit1_arrival_date && p.visit1_date) {
      events.push({
        ...base,
        date: p.visit1_date,
        kind: "visit1_self",
        label: KIND_LABELS.visit1_self,
        time: null,
        flightNo: null,
        hotelName: null,
        roomType: null,
        extraVisitId: null,
      });
    }

    if (p.visit2_arrival_date) {
      events.push({
        ...base,
        date: p.visit2_arrival_date,
        kind: "visit2_arrival",
        label: KIND_LABELS.visit2_arrival,
        time: p.visit2_arrival_time,
        flightNo: p.visit2_arrival_flight_no,
        hotelName: p.visit2_hotel_name,
        roomType: p.visit2_room_type,
        extraVisitId: null,
      });
    }
    if (p.visit2_departure_date) {
      events.push({
        ...base,
        date: p.visit2_departure_date,
        kind: "visit2_departure",
        label: KIND_LABELS.visit2_departure,
        time: p.visit2_departure_time,
        flightNo: p.visit2_departure_flight_no,
        hotelName: p.visit2_hotel_name,
        roomType: p.visit2_room_type,
        extraVisitId: null,
      });
    }
    if (!p.visit2_arrival_date && p.visit2_date) {
      events.push({
        ...base,
        date: p.visit2_date,
        kind: "visit2_self",
        label: KIND_LABELS.visit2_self,
        time: null,
        flightNo: null,
        hotelName: null,
        roomType: null,
        extraVisitId: null,
      });
    }

    for (const v of p.extra_visits ?? []) {
      if (!v.visit_date) continue;
      events.push({
        ...base,
        date: v.visit_date,
        kind: "extra_visit",
        label: v.label,
        time: v.arrival_time,
        flightNo: v.arrival_flight_no,
        hotelName: v.hotel_name,
        roomType: v.room_type,
        extraVisitId: v.id,
      });
    }
  }

  return events;
}

/** Groups events by ISO date (YYYY-MM-DD) for calendar-grid lookups. */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}
