import { DashboardCardId, DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";

export type { DashboardCardId };

export type SellerRole = "seller" | "admin";

/** Returned by a handful of server actions alongside their normal result, so the client can
 * react to a genuinely good moment (a sale, a payment, a tier jump) with confetti/a toast
 * instead of the usual plain "saved" message. `null` means nothing celebration-worthy happened
 * on this particular save. */
export interface Celebration {
  kind: "confetti" | "toast";
  message: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: SellerRole;
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type VisitStatus = "upcoming" | "completed";

export interface PatientExtraVisit {
  id: string;
  patient_id: string;
  label: string;
  visit_date: string | null;
  expected: number | null;
  actual: number | null;
  status: VisitStatus;
  /** Locked in the moment `actual` is first recorded (DB trigger) — the seller who gets
   * commission credit for this visit, independent of who owns the patient later on. */
  earned_by_seller_id: string | null;
  treatment: string | null;
  notes: string | null;

  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight_no: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight_no: string | null;
  hotel_name: string | null;
  room_type: string | null;
  arrival_transfer_arranged: boolean;
  departure_transfer_arranged: boolean;
  hotel_arranged: boolean;

  created_at: string;
  updated_at: string;
}

export type PatientExtraVisitInput = Omit<
  PatientExtraVisit,
  "id" | "patient_id" | "created_at" | "updated_at" | "earned_by_seller_id"
>;

export interface Patient {
  id: string;
  /** The seller who currently owns this patient — earns commission on visits not yet paid,
   * and can be handed to a colleague via reassignment. See `visit*_earned_by_seller_id` for
   * who actually earns commission on a visit already paid, which reassignment can't change. */
  responsible_seller_id: string;
  name: string;
  treatment: string | null;
  letter_treatment_items: string | null;
  confirmation_date: string | null; // ISO date
  needs_visit2: boolean;
  /** Months after visit 1 before visit 2 should happen — drives the due date of the
   * follow-up task auto-created when visit 1 is marked completed. */
  visit2_recall_months: number;

  visit1_date: string | null;
  visit1_expected: number | null;
  visit1_actual: number | null;
  visit1_status: VisitStatus;
  /** Locked in (DB trigger) the moment visit1_actual is first recorded. */
  visit1_earned_by_seller_id: string | null;

  visit2_date: string | null;
  visit2_expected: number | null;
  visit2_actual: number | null;
  visit2_status: VisitStatus;
  /** Locked in (DB trigger) the moment visit2_actual is first recorded. */
  visit2_earned_by_seller_id: string | null;

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
  visit1_arrival_transfer_arranged: boolean;
  visit1_departure_transfer_arranged: boolean;
  visit1_hotel_arranged: boolean;

  visit2_arrival_date: string | null;
  visit2_arrival_time: string | null;
  visit2_arrival_flight_no: string | null;
  visit2_departure_date: string | null;
  visit2_departure_time: string | null;
  visit2_departure_flight_no: string | null;
  visit2_hotel_name: string | null;
  visit2_room_type: string | null;
  visit2_arrival_transfer_arranged: boolean;
  visit2_departure_transfer_arranged: boolean;
  visit2_hotel_arranged: boolean;

  extra_visits: PatientExtraVisit[];

  created_at: string;
  updated_at: string;
}

export type PatientInput = Omit<
  Patient,
  | "id"
  | "responsible_seller_id"
  | "created_at"
  | "updated_at"
  | "extra_visits"
  | "visit1_earned_by_seller_id"
  | "visit2_earned_by_seller_id"
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

export type TaskStatus = "pending" | "done";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;

  due_date: string; // ISO date
  due_time: string | null; // "HH:MM"

  patient_id: string | null;
  patient_name: string | null;

  status: TaskStatus;
  notified_at: string | null;

  created_at: string;
  updated_at: string;
}

export type TaskInput = Omit<Task, "id" | "user_id" | "created_at" | "updated_at" | "notified_at">;

export interface CommissionSettings {
  tier1_threshold: number;
  tier1_rate: number;
  tier2_threshold: number;
  tier2_rate: number;
  tier3_rate: number;
  fixed_monthly_payment: number;
  hide_earnings: boolean;
  celebration_sound: boolean;
  show_try: boolean;
  currency: string;
  dashboard_cards: DashboardCardId[];
}

export const DEFAULT_SETTINGS: CommissionSettings = {
  tier1_threshold: 40000,
  tier1_rate: 0.02,
  tier2_threshold: 70000,
  tier2_rate: 0.03,
  tier3_rate: 0.04,
  fixed_monthly_payment: 0,
  hide_earnings: false,
  celebration_sound: true,
  show_try: false,
  currency: "GBP",
  dashboard_cards: DEFAULT_DASHBOARD_CARDS,
};

/** Clinic-wide (not per-seller) — confirmation letters and quote offers use this regardless
 * of which seller owns the patient/quote, so branding can't silently drift between sellers'
 * own settings rows the way it could when this lived in `settings`. */
export interface ClinicConfig {
  telegramGroupChatId: string | null;
  clinicName: string;
  clinicShortName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicLogoUrl: string | null;
}

export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  telegramGroupChatId: null,
  clinicName: "Thera Dental Clinic Turkey",
  clinicShortName: "Thera Dental Clinic",
  clinicAddress: "Kasya Plaza, Göksu, 6806 Sok No:8-3, 07260 Kepez/Antalya",
  clinicPhone: "+90 (544) 954 04 49",
  clinicEmail: "info@theradentturkey.com",
  clinicLogoUrl: null,
};
