import { CommissionSettings, MoneyPatient, Patient } from "@/types";
import { computeMonthlyAggregates, patientCommissionContribution, ratesMapFromAggregates, visitExpectedTotal } from "@/lib/commission";
import { patientDueNow } from "@/lib/balance";

/** One visit's money for the list: what was paid, or else the price + extras still expected
 * — in the patient's own currency. */
export interface VisitMoney {
  actual: number | null;
  expected: number | null;
}

/** A patient as the Patients list needs it: the fields it shows, filters and searches, plus
 * the money it would otherwise work out from every visit, extra and payment. Built on the
 * server (toListRows), so the browser gets a small row instead of the whole record. */
export type PatientListRow = Pick<
  Patient,
  | "id"
  | "name"
  | "phone"
  | "treatment"
  | "komo_reference"
  | "notes"
  | "confirmation_date"
  | "visit1_date"
  | "visit2_date"
  | "visit1_status"
  | "visit2_status"
  | "needs_visit2"
  | "responsible_seller_id"
  | "coordinator_id"
  | "currency"
  | "visit1_hotel_name"
  | "visit2_hotel_name"
  | "visit1_arrival_flight_no"
  | "visit2_arrival_flight_no"
> & {
  extra_visits: { id: string; label: string; visit_date: string | null; status: "upcoming" | "completed" }[];
  money: { visit1: VisitMoney; visit2: VisitMoney };
  balance: ReturnType<typeof patientDueNow>;
  /** The viewer's own commission on this patient (zero on visits credited to someone else). */
  commission: { actual: number; expected: number };
};

/** The list rows for `patients`, as the viewer (`userId`) sees them on `todayIso` (the clinic's
 * today). Commission tiers come from the viewer's own credited visits among `patients`, exactly
 * as the list worked them out in the browser before. */
export function toListRows(patients: MoneyPatient[], settings: CommissionSettings, userId: string, todayIso: string): PatientListRow[] {
  const ratesMap = ratesMapFromAggregates(computeMonthlyAggregates(patients, settings, userId));
  return patients.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    treatment: p.treatment,
    komo_reference: p.komo_reference,
    notes: p.notes,
    confirmation_date: p.confirmation_date,
    visit1_date: p.visit1_date,
    visit2_date: p.visit2_date,
    visit1_status: p.visit1_status,
    visit2_status: p.visit2_status,
    needs_visit2: p.needs_visit2,
    responsible_seller_id: p.responsible_seller_id,
    coordinator_id: p.coordinator_id,
    currency: p.currency,
    visit1_hotel_name: p.visit1_hotel_name,
    visit2_hotel_name: p.visit2_hotel_name,
    visit1_arrival_flight_no: p.visit1_arrival_flight_no,
    visit2_arrival_flight_no: p.visit2_arrival_flight_no,
    extra_visits: p.extra_visits.map((v) => ({ id: v.id, label: v.label, visit_date: v.visit_date, status: v.status })),
    money: {
      visit1: { actual: p.visit1_actual, expected: visitExpectedTotal(p, "visit1", p.visit1_expected) },
      visit2: { actual: p.visit2_actual, expected: visitExpectedTotal(p, "visit2", p.visit2_expected) },
    },
    balance: patientDueNow(p, todayIso),
    commission: patientCommissionContribution(p, ratesMap, userId),
  }));
}
