export type VisitStatus = "upcoming" | "completed";

export interface Patient {
  id: string;
  user_id: string;
  name: string;
  treatment: string | null;
  confirmation_date: string | null; // ISO date

  visit1_date: string | null;
  visit1_expected: number | null;
  visit1_actual: number | null;
  visit1_status: VisitStatus;

  visit2_date: string | null;
  visit2_expected: number | null;
  visit2_actual: number | null;
  visit2_status: VisitStatus;

  notes: string | null;
  komo_reference: string | null;

  visit1_arrival_date: string | null;
  visit1_arrival_time: string | null;
  visit1_arrival_flight_no: string | null;
  visit1_departure_date: string | null;
  visit1_departure_time: string | null;
  visit1_departure_flight_no: string | null;
  visit1_hotel_name: string | null;
  visit1_room_type: string | null;

  visit2_arrival_date: string | null;
  visit2_arrival_time: string | null;
  visit2_arrival_flight_no: string | null;
  visit2_departure_date: string | null;
  visit2_departure_time: string | null;
  visit2_departure_flight_no: string | null;
  visit2_hotel_name: string | null;
  visit2_room_type: string | null;

  created_at: string;
  updated_at: string;
}

export type PatientInput = Omit<
  Patient,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export interface CommissionSettings {
  low_tier_threshold: number;
  low_tier_rate: number;
  high_tier_rate: number;
  currency: string;
}

export const DEFAULT_SETTINGS: CommissionSettings = {
  low_tier_threshold: 70000,
  low_tier_rate: 0.03,
  high_tier_rate: 0.04,
  currency: "GBP",
};
