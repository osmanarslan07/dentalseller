import { DashboardCardId, DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";

export type { DashboardCardId };

export type VisitStatus = "upcoming" | "completed";

export interface Patient {
  id: string;
  user_id: string;
  name: string;
  treatment: string | null;
  letter_treatment_items: string | null;
  confirmation_date: string | null; // ISO date
  needs_visit2: boolean;

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

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type QuoteSplitMode = "percent" | "amount";

export interface Quote {
  id: string;
  user_id: string;
  name: string;
  label: string | null;
  status: QuoteStatus;

  intro_text: string | null;
  inclusions: string | null;

  total_price: number | null;
  currency: string;
  split_mode: QuoteSplitMode;
  deposit_percent: number;
  first_visit_amount: number | null;

  include_bone_graft_note: boolean;
  bone_graft_note: string | null;

  notes: string | null;
  komo_reference: string | null;

  converted_patient_id: string | null;

  created_at: string;
  updated_at: string;
}

export type QuoteInput = Omit<
  Quote,
  "id" | "user_id" | "created_at" | "updated_at" | "converted_patient_id"
>;

export interface CommissionSettings {
  tier1_threshold: number;
  tier1_rate: number;
  tier2_threshold: number;
  tier2_rate: number;
  tier3_rate: number;
  fixed_monthly_payment: number;
  hide_earnings: boolean;
  show_try: boolean;
  currency: string;
  dashboard_cards: DashboardCardId[];
  clinic_name: string;
  clinic_short_name: string;
  clinic_address: string;
  clinic_phone: string;
  clinic_email: string;
  clinic_logo_url: string | null;
}

export const DEFAULT_SETTINGS: CommissionSettings = {
  tier1_threshold: 40000,
  tier1_rate: 0.02,
  tier2_threshold: 70000,
  tier2_rate: 0.03,
  tier3_rate: 0.04,
  fixed_monthly_payment: 0,
  hide_earnings: false,
  show_try: false,
  currency: "GBP",
  dashboard_cards: DEFAULT_DASHBOARD_CARDS,
  clinic_name: "Thera Dental Clinic Turkey",
  clinic_short_name: "Thera Dental Clinic",
  clinic_address: "Kasya Plaza, Göksu, 6806 Sok No:8-3, 07260 Kepez/Antalya",
  clinic_phone: "+90 (544) 954 04 49",
  clinic_email: "info@theradentturkey.com",
  clinic_logo_url: null,
};
