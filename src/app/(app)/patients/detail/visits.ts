import { Patient, PatientExtraVisit, Transfer, VisitStatus } from "@/types";
import type { VisitTravel } from "./TransfersCard";

/** One visit — visit 1, visit 2 or an extra visit — in a single shape, so every visit tab is
 * the same layout. Field names match what updateVisitFields accepts. */
export interface VisitView {
  /** "visit1" | "visit2" | the extra visit's id */
  key: string;
  kind: "main" | "extra";
  label: string;
  date: string | null;
  expected: number | null;
  status: VisitStatus;
  pax: number;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight_no: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight_no: string | null;
  hotel_name: string | null;
  room_type: string | null;
  hotel_cost: number | null;
  hotel_arranged: boolean;
  /** Extra visits only — visit 1/2 use the patient's treatment. */
  treatment: string | null;
  notes: string | null;
}

function mainVisit(p: Patient, n: 1 | 2): VisitView {
  return {
    key: `visit${n}`,
    kind: "main",
    label: `Visit ${n}`,
    date: p[`visit${n}_date`],
    expected: p[`visit${n}_expected`],
    status: p[`visit${n}_status`],
    pax: p[`visit${n}_pax`],
    arrival_date: p[`visit${n}_arrival_date`],
    arrival_time: p[`visit${n}_arrival_time`],
    arrival_flight_no: p[`visit${n}_arrival_flight_no`],
    departure_date: p[`visit${n}_departure_date`],
    departure_time: p[`visit${n}_departure_time`],
    departure_flight_no: p[`visit${n}_departure_flight_no`],
    hotel_name: p[`visit${n}_hotel_name`],
    room_type: p[`visit${n}_room_type`],
    hotel_cost: p[`visit${n}_hotel_cost`],
    hotel_arranged: p[`visit${n}_hotel_arranged`],
    treatment: null,
    notes: null,
  };
}

function extraVisit(v: PatientExtraVisit): VisitView {
  return {
    key: v.id,
    kind: "extra",
    label: v.label,
    date: v.visit_date,
    expected: v.expected,
    status: v.status,
    pax: v.pax,
    arrival_date: v.arrival_date,
    arrival_time: v.arrival_time,
    arrival_flight_no: v.arrival_flight_no,
    departure_date: v.departure_date,
    departure_time: v.departure_time,
    departure_flight_no: v.departure_flight_no,
    hotel_name: v.hotel_name,
    room_type: v.room_type,
    hotel_cost: v.hotel_cost,
    hotel_arranged: v.hotel_arranged,
    treatment: v.treatment,
    notes: v.notes,
  };
}

/** Visit 1, visit 2 (when the patient needs one), then extra visits by date — the tab order. */
export function patientVisits(p: Patient): VisitView[] {
  const extras = [...p.extra_visits].sort((a, b) => {
    if (a.visit_date && b.visit_date) return a.visit_date.localeCompare(b.visit_date);
    if (a.visit_date || b.visit_date) return a.visit_date ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
  return [mainVisit(p, 1), ...(p.needs_visit2 ? [mainVisit(p, 2)] : []), ...extras.map(extraVisit)];
}

/** The visit the page opens on: the soonest one not completed yet (dated before undated),
 * or the latest visit once they're all done. */
export function currentVisitKey(visits: VisitView[]): string {
  const open = visits.filter((v) => v.status !== "completed");
  if (open.length > 0) {
    const dated = open.filter((v) => v.date).sort((a, b) => a.date!.localeCompare(b.date!));
    return (dated[0] ?? open[0]).key;
  }
  const dated = visits.filter((v) => v.date).sort((a, b) => a.date!.localeCompare(b.date!));
  return (dated[dated.length - 1] ?? visits[0]).key;
}

export function travelOf(v: VisitView): VisitTravel {
  return {
    date: v.date,
    arrivalDate: v.arrival_date,
    arrivalTime: v.arrival_time,
    arrivalFlight: v.arrival_flight_no,
    departureDate: v.departure_date,
    departureTime: v.departure_time,
    departureFlight: v.departure_flight_no,
    hotel: v.hotel_name,
    pax: v.pax,
  };
}

/** A visit's rows in a list that's keyed by visit_number / extra_visit_id. */
export function forVisit<T extends { visit_number: 1 | 2 | null; extra_visit_id: string | null }>(
  rows: T[],
  visitKey: string
): T[] {
  return rows.filter((r) => (r.extra_visit_id ?? `visit${r.visit_number}`) === visitKey);
}

/** Journeys that still need someone to drive them. */
export function transfersWithoutDriver(transfers: Transfer[]): Transfer[] {
  return transfers.filter((t) => !t.driver_id && t.status !== "done");
}

/** "Thu 25 Sep" (+ " 2026" when asked) — from a local YYYY-MM-DD, never shifted by timezone. */
export function shortDate(iso: string | null, withYear = false): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Whole nights between two local dates, or null. */
export function nightsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : null;
}

/** Digits only, for wa.me links — "+44 7700 900123" → "447700900123". */
export function whatsappNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
