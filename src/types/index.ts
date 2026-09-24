import { DashboardCardId, DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";

export type { DashboardCardId };

export type SellerRole = "seller" | "admin";

/** `superadmin` runs the platform (every clinic), belongs to no clinic, and never appears in
 * a clinic's own team — only in the /platform area. */
export type ProfileRole = SellerRole | "superadmin";

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
  role: ProfileRole;
  /** Null only for a superadmin (and, for a moment, a brand-new account not yet assigned). */
  clinic_id: string | null;
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Whoever gets credit (and commission) for a sale. Every clinic account has one with its own
 * id, so `responsible_seller_id === user.id` still means "mine"; a seller without an account
 * (profile_id null) is someone a coordinator records patients for — they never log in. */
export interface Seller {
  id: string;
  /** Null only for an account that hasn't signed in and set a name yet. */
  name: string | null;
  profile_id: string | null;
  is_active: boolean;
  created_at: string;
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
  /** People travelling on this visit, patient included — every transfer carries this many. */
  pax: number;
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
  /** What the clinic pays the hotel for this visit; null = the patient paid their own. */
  hotel_cost: number | null;
  /** Derived (DB trigger): has an arrival / departure transfer with a driver assigned. */
  arrival_transfer_arranged: boolean;
  departure_transfer_arranged: boolean;
  hotel_arranged: boolean;

  created_at: string;
  updated_at: string;
}

export type PatientExtraVisitInput = Omit<
  PatientExtraVisit,
  | "id"
  | "patient_id"
  | "created_at"
  | "updated_at"
  | "earned_by_seller_id"
  | "actual"
  | "arrival_transfer_arranged"
  | "departure_transfer_arranged"
>;

export interface Patient {
  id: string;
  /** The seller who currently owns this patient — earns commission on visits not yet paid,
   * and can be handed to a colleague via reassignment. See `visit*_earned_by_seller_id` for
   * who actually earns commission on a visit already paid, which reassignment can't change. */
  responsible_seller_id: string;
  /** The team member who follows this patient up (transfers, hotel, visits, payments) —
   * typically set when a coordinator enters a patient for a seller without an account. */
  coordinator_id: string | null;
  name: string;
  phone: string | null;
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
  /** People travelling on visit 1, patient included. */
  visit1_pax: number;
  /** Locked in (DB trigger) the moment visit1_actual is first recorded. */
  visit1_earned_by_seller_id: string | null;

  visit2_date: string | null;
  visit2_expected: number | null;
  visit2_actual: number | null;
  visit2_status: VisitStatus;
  visit2_pax: number;
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
  /** What the clinic pays the hotel for visit 1; null = the patient paid their own. */
  visit1_hotel_cost: number | null;
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
  visit2_hotel_cost: number | null;
  visit2_arrival_transfer_arranged: boolean;
  visit2_departure_transfer_arranged: boolean;
  visit2_hotel_arranged: boolean;

  extra_visits: PatientExtraVisit[];
  /** Extras sold on any of this patient's visits — see PatientExtra. */
  extras: PatientExtra[];
  /** Every payment recorded on any of this patient's visits. */
  payments: PatientPayment[];
  /** Just the cost side of each transfer — enough to work out a visit's costs. */
  transfer_costs: { visit_number: 1 | 2 | null; extra_visit_id: string | null; cost: number | null }[];
  /** Set only when the clinic deducts costs before commission: visit key ("visit1" |
   * "visit2" | extra visit id) → hotel + external transfer cost to take off that visit.
   * Null when the clinic pays commission on the full amount. */
  commission_costs: Record<string, number> | null;

  created_at: string;
  updated_at: string;
}

export type PatientInput = Omit<
  Patient,
  | "id"
  | "responsible_seller_id"
  | "coordinator_id"
  | "created_at"
  | "updated_at"
  | "extra_visits"
  | "extras"
  | "payments"
  | "transfer_costs"
  | "commission_costs"
  // the sum of the visit's payments, kept by a DB trigger — never typed in
  | "visit1_actual"
  | "visit2_actual"
  | "visit1_earned_by_seller_id"
  | "visit2_earned_by_seller_id"
  // derived from transfers by a DB trigger — never written by a patient save
  | "visit1_arrival_transfer_arranged"
  | "visit1_departure_transfer_arranged"
  | "visit2_arrival_transfer_arranged"
  | "visit2_departure_transfer_arranged"
>;

/** A transfer provider. Exactly one per clinic is internal — the clinic itself, with its own
 * car and drivers (never costs anything); the rest are external companies. */
export interface TransferCompany {
  id: string;
  name: string;
  is_internal: boolean;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  drivers: Driver[];
}

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  /** Transfer details are sent here (WhatsApp). */
  phone: string | null;
  /** Car and/or plate, e.g. "Mercedes Vito · 07 ABC 123". */
  vehicle: string | null;
  is_active: boolean;
  created_at: string;
}

export type PatientExtraKind = "night" | "treatment" | "other";

/** Something sold on top of a visit's treatment — extra hotel nights, an extra treatment.
 * Adds to what the patient owes for that visit and counts toward commission like treatment. */
export interface PatientExtra {
  id: string;
  patient_id: string;
  visit_number: 1 | 2 | null;
  extra_visit_id: string | null;
  kind: PatientExtraKind;
  description: string | null;
  quantity: number;
  unit_price: number;
  /** quantity × unit_price, computed by the database */
  total: number;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "cash" | "card" | "bank";

/** Money actually collected on a visit. `amount` is what counts (it sums into the visit's
 * actual); a card surcharge the patient paid on top is kept apart and never counts toward
 * commission. */
export interface PatientPayment {
  id: string;
  patient_id: string;
  visit_number: 1 | 2 | null;
  extra_visit_id: string | null;
  amount: number;
  method: PaymentMethod;
  /** Card only: the clinic's surcharge rate at the time, e.g. 0.03 — null when none was added. */
  surcharge_rate: number | null;
  surcharge_amount: number;
  paid_on: string;
  received_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type TransferKind = "arrival" | "departure" | "local";
export type TransferStatus = "planned" | "sent" | "done";

/** One car journey for one visit — visit 1/2 (visit_number) or an extra visit (extra_visit_id). */
export interface Transfer {
  id: string;
  patient_id: string;
  visit_number: 1 | 2 | null;
  extra_visit_id: string | null;
  kind: TransferKind;
  transfer_date: string | null;
  transfer_time: string | null;
  from_place: string | null;
  to_place: string | null;
  pax: number;
  company_id: string | null;
  driver_id: string | null;
  flight_no: string | null;
  /** External companies only — always null for the clinic's own transport (DB-enforced). */
  cost: number | null;
  status: TransferStatus;
  sent_at: string | null;
  /** WhatsApp Business API only: the last message about this transfer and how far it got. */
  wa_message_id: string | null;
  wa_status: WhatsAppStatus | null;
  wa_status_at: string | null;
  wa_error: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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
  /** Hotel and external-transfer costs come off a visit's amount before commission. */
  deductCostsFromCommission: boolean;
  /** Optional card-payment surcharge, e.g. 0.03 = 3%. Never counts toward commission. */
  cardSurchargeRate: number;
  /** Settings → Transfers: who new airport (arrival/departure) and local transfers start with. */
  transferDefaults: TransferDefaults;
  driverMessages: DriverMessagesConfig;
}

/** How transfer details reach drivers: WhatsApp opened on the user's device, sent by the
 * clinic's WhatsApp Business API number, or not at all (copy the text by hand). */
export type DriverMessagesMode = "app" | "api" | "off";
export type WhatsAppStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

/** Settings → Transfers → Driver messages. Nothing secret here — the access token and app
 * secret are only ever read on the server. */
export interface DriverMessagesConfig {
  mode: DriverMessagesMode;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  templateSingle: string;
  templateDay: string;
  templateLang: string;
  /** Set when a test message went through — API mode can't be switched on before that. */
  verifiedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface TransferDefaults {
  airportCompanyId: string | null;
  airportDriverId: string | null;
  localCompanyId: string | null;
  localDriverId: string | null;
}

/** Only used when a clinic has no clinic_config row (every clinic gets one at creation).
 * Deliberately blank: with multiple clinics, any real name/address here would print on some
 * other clinic's letters and offers. */
export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  telegramGroupChatId: null,
  clinicName: "",
  clinicShortName: "",
  clinicAddress: "",
  clinicPhone: "",
  clinicEmail: "",
  clinicLogoUrl: null,
  deductCostsFromCommission: false,
  cardSurchargeRate: 0.03,
  transferDefaults: { airportCompanyId: null, airportDriverId: null, localCompanyId: null, localDriverId: null },
  driverMessages: {
    mode: "app",
    phoneNumberId: null,
    businessAccountId: null,
    templateSingle: "transfer_bildirimi",
    templateDay: "gunluk_transfer_listesi",
    templateLang: "tr",
    verifiedAt: null,
    lastError: null,
    lastErrorAt: null,
  },
};
