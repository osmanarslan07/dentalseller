import { DashboardCardId, DEFAULT_DASHBOARD_CARDS } from "@/lib/dashboard-cards";

export type { DashboardCardId };

/** The old single role, still kept in sync by the database: "admin" exactly when `roles`
 * includes admin. New code reads `roles` / permissions instead. */
export type SellerRole = "seller" | "admin";

/** `superadmin` runs the platform (every clinic), belongs to no clinic, and never appears in
 * a clinic's own team — only in the /platform area. */
export type ProfileRole = SellerRole | "superadmin";

/** The four roles every clinic has. What each may do lives in the database (role_permissions,
 * or the clinic's own changes in clinic_role_permissions); see src/lib/roles.ts. */
export type BuiltinRole = "admin" | "sales" | "coordinator" | "accountant";

/** A clinic member can hold several: built-in roles, or the clinic's own custom roles
 * ("custom_…" keys, named in clinic_roles). */
export type MemberRole = BuiltinRole | `custom_${string}`;

export const MEMBER_ROLES: BuiltinRole[] = ["admin", "sales", "coordinator", "accountant"];

export const ROLE_LABELS: Record<BuiltinRole, string> = {
  admin: "Admin",
  sales: "Sales",
  coordinator: "Coordinator",
  accountant: "Accountant",
};

export function isBuiltinRole(role: string): role is BuiltinRole {
  return (MEMBER_ROLES as string[]).includes(role);
}

/** A role's display name: the built-in label, or the custom role's name from `customNames`. */
export function roleLabel(role: string, customNames?: Record<string, string>): string {
  return isBuiltinRole(role) ? ROLE_LABELS[role] : customNames?.[role] ?? "Custom role";
}

/** Parts of the product a clinic can have switched on (clinics.modules). Core — patients,
 * payments, tasks, files, team, settings — is always on. "inbox" is reserved. */
export type ClinicModule = "operations" | "sales" | "accounting";

export const CLINIC_MODULES: ClinicModule[] = ["operations", "sales", "accounting"];

export const MODULE_LABELS: Record<ClinicModule, string> = {
  operations: "Operations — transfers, hotels, drivers",
  sales: "Sales — quotes, commission, earnings",
  accounting: "Accounting",
};

/** Mirrors the catalog in supabase/schema.sql (permissions). Labels and grouping for the
 * Roles page are in src/lib/permission-catalog.ts. */
export type Permission =
  | "patients.view"
  | "patients.edit"
  | "patients.delete"
  | "patients.export"
  | "sellers.assign"
  | "sellers.manage"
  | "money.edit"
  | "payments.record"
  | "payments.edit"
  | "files.view"
  | "files.manage"
  | "files.delete"
  | "transfers.manage"
  | "drivers.manage"
  | "messaging.manage"
  | "quotes.use"
  | "earnings.own"
  | "earnings.all"
  | "accounting.view"
  | "tasks.use"
  | "team.view"
  | "team.manage"
  | "team.delete"
  | "roles.view"
  | "roles.edit"
  | "roles.delete"
  | "activity.view"
  | "settings.branding"
  | "settings.telegram"
  | "settings.money"
  /** Before step G: every clinic setting. Admin only; nothing new checks it. */
  | "settings.clinic";

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
  /** Empty for a superadmin. */
  roles: MemberRole[];
  /** Null only for a superadmin (and, for a moment, a brand-new account not yet assigned). */
  clinic_id: string | null;
  telegram_chat_id: string | null;
  is_active: boolean;
  /** International format ("+447700900123"); used for WhatsApp. */
  phone: string | null;
  /** When the photo last changed; null = no photo. */
  avatar_updated_at: string | null;
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
  /** The currency this seller usually agrees prices in — their new patients start in it.
   * Null = the clinic's main currency. */
  default_currency: string | null;
  created_at: string;
}

export type VisitStatus = "upcoming" | "completed";

/** A file kept on a patient (x-ray, treatment plan, passport…). The file itself is in the
 * private patient-files bucket; open it through a signed link (getPatientFileLink). */
export interface PatientFile {
  id: string;
  patient_id: string;
  name: string;
  path: string;
  size: number;
  mime: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** A visit's discount: a fixed amount (in the patient's deal currency) or a % of the visit's price + extras. */
export type DiscountType = "amount" | "percent";

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

  /** Discount off this visit's price + extras (see visitDiscount); null type = none. */
  discount_type: DiscountType | null;
  discount_value: number | null;
  discount_reason: string | null;

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
  // set on their own from the Money card (money.edit)
  | "discount_type"
  | "discount_value"
  | "discount_reason"
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
  /** The currency the price was agreed in — every price, extra, discount and "still due" on
   * this patient is in it. Locked once a payment is recorded. */
  currency: string;
  /** 1 unit of `currency` in the clinic's main currency, fixed on the day the price was agreed
   * (1 for a main-currency patient). Commission and reports use it, so they don't move with
   * the markets. */
  deal_rate: number;
  deal_rate_on: string | null;
  deal_rate_source: "auto" | "clinic" | "manual" | null;
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
  /** Discount off visit 1's price + extras (see visitDiscount); null type = none. */
  visit1_discount_type: DiscountType | null;
  visit1_discount_value: number | null;
  visit1_discount_reason: string | null;

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
  visit2_discount_type: DiscountType | null;
  visit2_discount_value: number | null;
  visit2_discount_reason: string | null;

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
  // set by the patient's own save logic (deal currency + rate), not typed in as-is
  | "currency"
  | "deal_rate"
  | "deal_rate_on"
  | "deal_rate_source"
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
  // set on their own from the Money card (money.edit)
  | "visit1_discount_type"
  | "visit1_discount_value"
  | "visit1_discount_reason"
  | "visit2_discount_type"
  | "visit2_discount_value"
  | "visit2_discount_reason"
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
 * commission. Handed over as `paid_amount` in `currency` (any the clinic deals in); `amount`
 * is that in the patient's deal currency and `main_amount` in the clinic's main currency on
 * the day it came in — both worked out by the database from the rates. */
export interface PatientPayment {
  id: string;
  patient_id: string;
  visit_number: 1 | 2 | null;
  extra_visit_id: string | null;
  /** In the patient's deal currency. */
  amount: number;
  currency: string;
  paid_amount: number;
  /** 1 unit of `currency` in the deal currency / in the main currency. */
  rate_to_deal: number;
  rate_to_main: number;
  main_amount: number;
  rate_source: "auto" | "clinic" | "manual" | null;
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
  /** "Also show approx. in …" next to earnings. Money itself is always in the clinic's main
   * currency. */
  show_try: boolean;
  /** The currency of that approximate figure. */
  approx_currency: string;
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
  approx_currency: "TRY",
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
  /** Reporting currency: commission, tiers, totals. Fixed once the clinic has patients. */
  mainCurrency: string;
  /** Other currencies prices can be agreed / payments taken in. Empty = single-currency clinic. */
  dealCurrencies: string[];
  /** The clinic's own rates, 1 unit = x main currency; a currency not here uses the market rate. */
  fixedRates: Record<string, number>;
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
  mainCurrency: "GBP",
  dealCurrencies: [],
  fixedRates: {},
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
