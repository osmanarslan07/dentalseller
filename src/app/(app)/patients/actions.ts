"use server";

import { msg } from "@/i18n";
import { st } from "@/i18n/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { addMonths, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicConfig, getPatient, getSellers } from "@/lib/data";
import { plainAmount } from "@/lib/money";
import { dealCurrencyFields } from "@/lib/deal-currency";
import { normalizePhone } from "@/lib/phone";
import { SellerChoice, resolveSellerChoice, sellerChoiceFromForm } from "@/lib/seller-choice";
import { getEnvChatsClinicId, getFallbackChatId, sendTelegramMessageToMany } from "@/lib/telegram";
import { ActivityLogRow, diffFields, logActivity } from "@/lib/activity-log";
import { Celebration, Patient, PatientExtraVisit, PatientInput } from "@/types";
import { getViewer } from "@/lib/viewer";
import { recordSupportEvent } from "@/lib/support-log";
import { recordRef } from "@/lib/activity-mask";
import { visitDiscount, visitDiscountSetting, visitExpectedTotal } from "@/lib/commission";
import { extraLabel, extrasFor } from "@/lib/balance";
import { PATIENT_FILE_BUCKET } from "@/lib/patient-files";
import { can, requirePermission } from "@/lib/permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Built from local Y/M/D components on both ends (never via `new Date(isoString)`, which
 * parses as UTC) so this can't drift a day depending on the server's timezone offset. */
function addMonthsToDateString(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, d), months), "yyyy-MM-dd");
}

/** Auto-creates the "book visit 2" reminder the moment visit 1 is marked completed — no
 * button, no manual step. Runs with the service-role client since the task has to belong to
 * `taskOwnerId` (see followUpOwner), who may not be whoever's saving this particular edit
 * (any active seller can update a shared patient record). Best-effort: a failure here
 * should never break the patient save it's attached to. */
async function maybeCreateFollowUpTask(
  patientId: string,
  taskOwnerId: string,
  input: Pick<PatientInput, "name" | "visit1_status" | "needs_visit2" | "visit1_date" | "visit2_date" | "visit2_recall_months">
) {
  if (!(input.visit1_status === "completed" && input.needs_visit2 && input.visit1_date && !input.visit2_date)) return;
  try {
    const admin = createAdminClient();
    const title = `Book visit 2 — ${input.name}`;
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("patient_id", patientId)
      .eq("user_id", taskOwnerId)
      .eq("status", "pending")
      .eq("title", title)
      .maybeSingle();
    if (existing) return;

    const dueDate = addMonthsToDateString(input.visit1_date, input.visit2_recall_months);
    await admin.from("tasks").insert({
      user_id: taskOwnerId,
      title,
      due_date: dueDate,
      patient_id: patientId,
      patient_name: input.name,
      status: "pending",
    });
  } catch (err) {
    console.error("Auto follow-up task creation failed:", err);
  }
}

/** A task has to land with an account: the seller's own, else the patient's coordinator,
 * else whoever is saving. */
async function followUpOwner(
  supabase: SupabaseClient,
  patient: Pick<Patient, "responsible_seller_id" | "coordinator_id">,
  fallbackId: string
): Promise<string> {
  const { data } = await supabase.from("sellers").select("profile_id").eq("id", patient.responsible_seller_id).maybeSingle();
  return data?.profile_id ?? patient.coordinator_id ?? fallbackId;
}

/** The seller's and coordinator's own chats plus the clinic-wide fallback (deduped) — so a
 * notification never silently disappears just because someone hasn't linked Telegram yet, or
 * the seller has no account at all. The fallback only applies to the clinic that owns the env
 * chats (see getEnvChatsClinicId). */
async function getRecipientChatIds(supabase: SupabaseClient, peopleIds: (string | null)[]): Promise<string[]> {
  const wanted = [...new Set(peopleIds.filter((id): id is string => !!id))];
  const [{ data }, envChatsClinicId, viewer] = await Promise.all([
    supabase.from("profiles").select("telegram_chat_id").in("id", wanted),
    getEnvChatsClinicId(),
    getViewer(),
  ]);
  const ids = new Set<string>();
  for (const p of data ?? []) if (p.telegram_chat_id) ids.add(p.telegram_chat_id);
  const fallback = getFallbackChatId(viewer?.clinicId ?? null, envChatsClinicId);
  if (fallback) ids.add(fallback);
  return [...ids];
}

const PATIENT_AUDIT_FIELDS: { key: keyof PatientInput; label: string }[] = [
  { key: "name", label: "name" },
  { key: "phone", label: "phone" },
  { key: "treatment", label: "treatment" },
  { key: "notes", label: "notes" },
  { key: "komo_reference", label: "komo reference" },
  { key: "confirmation_date", label: "confirmed" },
  { key: "needs_visit2", label: "needs visit 2" },
  { key: "visit2_recall_months", label: "visit2 recall months" },

  { key: "visit1_date", label: "visit1 date" },
  { key: "visit1_expected", label: "visit1 expected" },
  { key: "visit1_status", label: "visit1 status" },
  { key: "visit1_pax", label: "visit1 pax" },
  { key: "visit1_arrival_date", label: "visit1 arrival date" },
  { key: "visit1_arrival_time", label: "visit1 arrival time" },
  { key: "visit1_arrival_flight_no", label: "visit1 arrival flight" },
  { key: "visit1_departure_date", label: "visit1 departure date" },
  { key: "visit1_departure_time", label: "visit1 departure time" },
  { key: "visit1_departure_flight_no", label: "visit1 departure flight" },
  { key: "visit1_hotel_name", label: "visit1 hotel" },
  { key: "visit1_room_type", label: "visit1 room type" },
  { key: "visit1_hotel_cost", label: "visit1 hotel cost" },
  { key: "visit1_hotel_arranged", label: "visit1 hotel arranged" },

  { key: "visit2_date", label: "visit2 date" },
  { key: "visit2_expected", label: "visit2 expected" },
  { key: "visit2_status", label: "visit2 status" },
  { key: "visit2_pax", label: "visit2 pax" },
  { key: "visit2_arrival_date", label: "visit2 arrival date" },
  { key: "visit2_arrival_time", label: "visit2 arrival time" },
  { key: "visit2_arrival_flight_no", label: "visit2 arrival flight" },
  { key: "visit2_departure_date", label: "visit2 departure date" },
  { key: "visit2_departure_time", label: "visit2 departure time" },
  { key: "visit2_departure_flight_no", label: "visit2 departure flight" },
  { key: "visit2_hotel_name", label: "visit2 hotel" },
  { key: "visit2_room_type", label: "visit2 room type" },
  { key: "visit2_hotel_cost", label: "visit2 hotel cost" },
  { key: "visit2_hotel_arranged", label: "visit2 hotel arranged" },
];

const EXTRA_VISIT_AUDIT_FIELDS: { key: keyof ReturnType<typeof parseExtraVisitInput>; label: string }[] = [
  { key: "label", label: "label" },
  { key: "visit_date", label: "date" },
  { key: "expected", label: "expected" },
  { key: "status", label: "status" },
  { key: "pax", label: "pax" },
  { key: "treatment", label: "treatment" },
  { key: "notes", label: "notes" },
  { key: "arrival_date", label: "arrival date" },
  { key: "arrival_time", label: "arrival time" },
  { key: "arrival_flight_no", label: "arrival flight" },
  { key: "departure_date", label: "departure date" },
  { key: "departure_time", label: "departure time" },
  { key: "departure_flight_no", label: "departure flight" },
  { key: "hotel_name", label: "hotel" },
  { key: "room_type", label: "room type" },
  { key: "hotel_cost", label: "hotel cost" },
  { key: "hotel_arranged", label: "hotel arranged" },
];

function formatDateTime(date: string | null, time: string | null) {
  if (!date) return null;
  const [y, m, d] = date.split("-");
  const datePart = `${d}.${m}.${y}`;
  return time ? `${datePart} ${time}` : datePart;
}

/** Actual takes priority — once a payment is received, that's the number that matters. */
function paymentLine(label: string, actual: number | null, expected: number | null, currency: string): string | null {
  if (actual != null) return `<b>${label} (alındı):</b> ${plainAmount(actual, currency)}`;
  if (expected != null) return `<b>${label} (beklenen):</b> ${plainAmount(expected, currency)}`;
  return null;
}

function amountOf(actual: number | null, expected: number | null): number {
  return actual ?? expected ?? 0;
}

function buildNewPatientMessage(input: PatientInput, currency: string): string {
  const m = (n: number) => plainAmount(n, currency);
  const arrival = formatDateTime(input.visit1_arrival_date, input.visit1_arrival_time);
  const useVisit2Departure = input.needs_visit2 && !!input.visit2_departure_date;
  const departureDate = useVisit2Departure ? input.visit2_departure_date : input.visit1_departure_date;
  const departureTime = useVisit2Departure ? input.visit2_departure_time : input.visit1_departure_time;
  const departureFlightNo = useVisit2Departure ? input.visit2_departure_flight_no : input.visit1_departure_flight_no;
  const departure = formatDateTime(departureDate, departureTime);
  const hotel = input.visit2_hotel_name || input.visit1_hotel_name;
  const roomType = input.visit2_room_type || input.visit1_room_type;
  const total = (input.visit1_expected ?? 0) + (input.needs_visit2 ? input.visit2_expected ?? 0 : 0);

  const lines = [
    `<b>Hasta Adı:</b> ${input.name}`,
    input.treatment ? `<b>Tedavi:</b> ${input.treatment}` : null,
    arrival
      ? `<b>Geliş:</b> ${arrival}${input.visit1_arrival_flight_no ? ` - <code>${input.visit1_arrival_flight_no}</code>` : ""}`
      : null,
    departure
      ? `<b>Gidiş:</b> ${departure}${departureFlightNo ? ` - <code>${departureFlightNo}</code>` : ""}`
      : null,
    hotel ? `<b>Otel:</b> ${hotel}` : null,
    roomType ? `<b>Oda Türü:</b> ${roomType}` : null,
    input.visit1_expected != null ? `<b>İlk visit ödeme:</b> ${m(input.visit1_expected)}` : null,
    input.needs_visit2 && input.visit2_expected != null ? `<b>İkinci visit ödeme:</b> ${m(input.visit2_expected)}` : null,
    total ? `<b>Toplam Ödeme:</b> ${m(total)}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

/** "visit1" | "visit2" | an extra_visits row id — resolved to that one visit's own fields only,
 * so a resend never mixes e.g. visit 1's arrival with visit 2's departure like the initial
 * new-patient summary does. */
function buildVisitMessage(patient: Patient, visitKey: string): string {
  let label: string;
  let treatment: string | null;
  let expected: number | null;
  let actual: number | null;
  let arrivalDate: string | null, arrivalTime: string | null, arrivalFlightNo: string | null;
  let departureDate: string | null, departureTime: string | null, departureFlightNo: string | null;
  let hotelName: string | null, roomType: string | null;

  if (visitKey === "visit1") {
    label = "Visit 1";
    treatment = patient.treatment;
    expected = patient.visit1_expected;
    actual = patient.visit1_actual;
    arrivalDate = patient.visit1_arrival_date;
    arrivalTime = patient.visit1_arrival_time;
    arrivalFlightNo = patient.visit1_arrival_flight_no;
    departureDate = patient.visit1_departure_date;
    departureTime = patient.visit1_departure_time;
    departureFlightNo = patient.visit1_departure_flight_no;
    hotelName = patient.visit1_hotel_name;
    roomType = patient.visit1_room_type;
  } else if (visitKey === "visit2") {
    label = "Visit 2";
    treatment = patient.treatment;
    expected = patient.visit2_expected;
    actual = patient.visit2_actual;
    arrivalDate = patient.visit2_arrival_date;
    arrivalTime = patient.visit2_arrival_time;
    arrivalFlightNo = patient.visit2_arrival_flight_no;
    departureDate = patient.visit2_departure_date;
    departureTime = patient.visit2_departure_time;
    departureFlightNo = patient.visit2_departure_flight_no;
    hotelName = patient.visit2_hotel_name;
    roomType = patient.visit2_room_type;
  } else {
    const extra = patient.extra_visits.find((v) => v.id === visitKey);
    if (!extra) throw new Error(msg("Visit not found"));
    label = extra.label;
    treatment = extra.treatment ?? patient.treatment;
    expected = extra.expected;
    actual = extra.actual;
    arrivalDate = extra.arrival_date;
    arrivalTime = extra.arrival_time;
    arrivalFlightNo = extra.arrival_flight_no;
    departureDate = extra.departure_date;
    departureTime = extra.departure_time;
    departureFlightNo = extra.departure_flight_no;
    hotelName = extra.hotel_name;
    roomType = extra.room_type;
  }

  const arrival = formatDateTime(arrivalDate, arrivalTime);
  const departure = formatDateTime(departureDate, departureTime);

  // visit1/visit2 messages carry both visits' payments (+ a running total) for planning
  // purposes — whoever's arranging visit2 logistics needs to know what visit1 already
  // brought in, and vice versa. Extra visits stay single-payment, as before.
  // expected amounts include the extras sold on that visit (paid amounts already do)
  const rawExpected = expected;
  expected = visitExpectedTotal(patient, visitKey, expected);
  const visit1Expected = visitExpectedTotal(patient, "visit1", patient.visit1_expected);
  const visit2Expected = visitExpectedTotal(patient, "visit2", patient.visit2_expected);

  const cur = patient.currency;
  const m = (n: number) => plainAmount(n, cur);
  const paymentLines: (string | null)[] = extrasFor(patient, visitKey).map(
    (e) => `<b>Ekstra:</b> ${extraLabel(e, "tr")} — ${m(e.total)}`
  );
  const discount = visitDiscountSetting(patient, visitKey);
  if (discount) {
    const base = (rawExpected ?? 0) + extrasFor(patient, visitKey).reduce((sum, e) => sum + e.total, 0);
    const off = visitDiscount(patient, visitKey, base);
    paymentLines.push(
      `<b>İndirim:</b> −${m(off)}${discount.type === "percent" ? ` (%${discount.value})` : ""}${discount.reason ? ` — ${discount.reason}` : ""}`
    );
  }
  if (visitKey === "visit1") {
    paymentLines.push(paymentLine("İlk visit ödeme", actual, expected, cur));
    if (patient.needs_visit2) {
      paymentLines.push(paymentLine("İkinci visit ödeme", patient.visit2_actual, visit2Expected, cur));
      const total = amountOf(actual, expected) + amountOf(patient.visit2_actual, visit2Expected);
      if (total > 0) paymentLines.push(`<b>Toplam Ödeme:</b> ${m(total)}`);
    }
  } else if (visitKey === "visit2") {
    paymentLines.push(paymentLine("İlk visit ödeme", patient.visit1_actual, visit1Expected, cur));
    paymentLines.push(paymentLine("İkinci visit ödeme", actual, expected, cur));
    const total = amountOf(patient.visit1_actual, visit1Expected) + amountOf(actual, expected);
    if (total > 0) paymentLines.push(`<b>Toplam Ödeme:</b> ${m(total)}`);
  } else {
    paymentLines.push(paymentLine("Ödeme", actual, expected, cur));
  }

  const lines = [
    `<b>Hasta Adı:</b> ${patient.name}`,
    `<b>Visit:</b> ${label}`,
    treatment ? `<b>Tedavi:</b> ${treatment}` : null,
    arrival ? `<b>Geliş:</b> ${arrival}${arrivalFlightNo ? ` - <code>${arrivalFlightNo}</code>` : ""}` : null,
    departure ? `<b>Gidiş:</b> ${departure}${departureFlightNo ? ` - <code>${departureFlightNo}</code>` : ""}` : null,
    hotelName ? `<b>Otel:</b> ${hotelName}` : null,
    roomType ? `<b>Oda Türü:</b> ${roomType}` : null,
    ...paymentLines,
  ].filter(Boolean);

  return lines.join("\n");
}

/** People travelling, patient included — never below 1, and a typo can't produce a bus-load. */
function parsePax(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 1;
}

function parseInput(formData: FormData): PatientInput {
  const num = (key: string) => {
    const v = formData.get(key);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (key: string) => {
    const v = formData.get(key);
    return v == null || v === "" ? null : String(v);
  };

  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: normalizePhone(str("phone")),
    treatment: str("treatment"),
    letter_treatment_items: str("letter_treatment_items"),
    confirmation_date: str("confirmation_date"),
    needs_visit2: formData.get("needs_visit2") === "on",
    visit2_recall_months: (() => {
      const n = Math.round(Number(formData.get("visit2_recall_months")));
      return Number.isFinite(n) && n > 0 ? n : 3;
    })(),
    visit1_date: str("visit1_date"),
    visit1_expected: num("visit1_expected"),
    visit1_status: (formData.get("visit1_status") as "upcoming" | "completed") || "upcoming",
    visit1_pax: parsePax(formData.get("visit1_pax")),
    visit2_date: str("visit2_date"),
    visit2_expected: num("visit2_expected"),
    visit2_status: (formData.get("visit2_status") as "upcoming" | "completed") || "upcoming",
    visit2_pax: parsePax(formData.get("visit2_pax")),
    notes: str("notes"),
    komo_reference: str("komo_reference"),
    visit1_arrival_date: str("visit1_arrival_date"),
    visit1_arrival_time: str("visit1_arrival_time"),
    visit1_arrival_flight_no: str("visit1_arrival_flight_no"),
    visit1_departure_date: str("visit1_departure_date"),
    visit1_departure_time: str("visit1_departure_time"),
    visit1_departure_flight_no: str("visit1_departure_flight_no"),
    visit1_hotel_name: str("visit1_hotel_name"),
    visit1_room_type: str("visit1_room_type"),
    visit1_hotel_cost: num("visit1_hotel_cost"),
    visit1_hotel_arranged: formData.get("visit1_hotel_arranged") === "on",
    visit2_arrival_date: str("visit2_arrival_date"),
    visit2_arrival_time: str("visit2_arrival_time"),
    visit2_arrival_flight_no: str("visit2_arrival_flight_no"),
    visit2_departure_date: str("visit2_departure_date"),
    visit2_departure_time: str("visit2_departure_time"),
    visit2_departure_flight_no: str("visit2_departure_flight_no"),
    visit2_hotel_name: str("visit2_hotel_name"),
    visit2_room_type: str("visit2_room_type"),
    visit2_hotel_cost: num("visit2_hotel_cost"),
    visit2_hotel_arranged: formData.get("visit2_hotel_arranged") === "on",
  };
}

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const input = parseInput(formData);
  if (!input.name) throw new Error(await st("Name is required"));

  // Entering a patient for someone else makes you its coordinator — the one who follows up.
  const choice = sellerChoiceFromForm(formData);
  if ((choice.newSellerName || (choice.sellerId && choice.sellerId !== user.id)) && !can(user.viewer, "sellers.assign")) {
    throw new Error(await st("You can only add patients as yourself"));
  }
  const seller = await resolveSellerChoice(supabase, choice, user.id);
  // The form's Coordinator picker; without one (older clients), whoever enters a patient for
  // someone else becomes its coordinator. The database checks the pick can edit patients.
  const pickedCoordinator = formData.get("coordinator_id");
  const coordinatorId =
    typeof pickedCoordinator === "string"
      ? UUID_RE.test(pickedCoordinator)
        ? pickedCoordinator
        : null
      : seller.id === user.id
        ? null
        : user.id;

  // The deal currency: picked on the form when the clinic deals in several, else the seller's
  // usual one, else the main currency — with the rate on the day it's agreed.
  const clinicConfig = await getClinicConfig(supabase);
  const picked = formData.get("currency");
  const usual = (await getSellers(supabase)).find((s) => s.id === seller.id)?.default_currency;
  const allowed = [clinicConfig.mainCurrency, ...clinicConfig.dealCurrencies];
  const currency =
    typeof picked === "string" && picked ? picked : usual && allowed.includes(usual) ? usual : clinicConfig.mainCurrency;
  const deal = await dealCurrencyFields(clinicConfig, currency, input.confirmation_date);

  const { data: created, error } = await supabase
    .from("patients")
    .insert({ ...input, ...deal, responsible_seller_id: seller.id, coordinator_id: coordinatorId })
    .select("id")
    .single();
  if (error) {
    throw new Error(/row-level security/i.test(error.message) ? "You can only add patients as yourself" : error.message);
  }

  await logActivity(supabase, user.actorId, "patient_created", "patient", created?.id ?? null, input.name);

  if (created?.id) await maybeCreateFollowUpTask(created.id, seller.hasAccount ? seller.id : coordinatorId ?? user.id, input);

  try {
    const chatIds = await getRecipientChatIds(supabase, [seller.id, coordinatorId]);
    if (chatIds.length > 0) await sendTelegramMessageToMany(chatIds, buildNewPatientMessage(input, deal.currency));
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  revalidatePath("/tasks");

  const { count } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("responsible_seller_id", seller.id);
  const celebration: Celebration =
    seller.id === user.id && (count ?? 0) <= 1
      ? { kind: "confetti", message: await st("🌟 {name} is your first patient — welcome aboard!", { name: input.name }) }
      : { kind: "confetti", message: await st("🎉 {name} confirmed!", { name: input.name }) };

  return { id: (created?.id as string | undefined) ?? null, celebration };
}

/** How each field saved on its own from the patient page is cleaned up — the page's cards save
 * just their own fields, so each one is checked here rather than trusting the client's shape. */
type FieldKind = "text" | "phone" | "requiredText" | "date" | "time" | "money" | "pax" | "status" | "bool" | "months";

function cleanField(kind: FieldKind, v: unknown): unknown {
  switch (kind) {
    case "text":
    case "requiredText": {
      const s = typeof v === "string" ? v.trim() : "";
      if (kind === "requiredText" && !s) throw new Error(msg("This field can't be empty"));
      return s || null;
    }
    case "phone":
      return normalizePhone(typeof v === "string" ? v : null);
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    case "time": {
      if (v == null || v === "") return null;
      if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())) {
        throw new Error(msg("Use 24-hour times, e.g. 14:30"));
      }
      return v.trim();
    }
    case "money": {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(msg("Amounts must be 0 or more"));
      return n;
    }
    case "pax":
      return parsePax(v as FormDataEntryValue | null);
    case "status":
      return v === "completed" ? "completed" : "upcoming";
    case "bool":
      return v === true;
    case "months": {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n > 0 ? n : 3;
    }
  }
}

function cleanPatch(patch: Record<string, unknown>, allowed: Record<string, FieldKind>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const kind = allowed[key];
    if (!kind) throw new Error(`Unknown field: ${key}`);
    out[key] = cleanField(kind, value);
  }
  if (Object.keys(out).length === 0) throw new Error(msg("Nothing to save"));
  return out;
}

const PATIENT_FIELD_KINDS: Record<string, FieldKind> = {
  name: "requiredText",
  phone: "phone",
  treatment: "text",
  letter_treatment_items: "text",
  notes: "text",
  komo_reference: "text",
  confirmation_date: "date",
  needs_visit2: "bool",
  visit2_recall_months: "months",
};

/** The per-visit fields, named once — visit 1/2 store them as `visit{n}_<field>`, an extra
 * visit's own row as `<field>` (except the date, `visit_date`). */
const VISIT_FIELD_KINDS: Record<string, FieldKind> = {
  date: "date",
  expected: "money",
  status: "status",
  pax: "pax",
  arrival_date: "date",
  arrival_time: "time",
  arrival_flight_no: "text",
  departure_date: "date",
  departure_time: "time",
  departure_flight_no: "text",
  hotel_name: "text",
  room_type: "text",
  hotel_cost: "money",
  hotel_arranged: "bool",
};
/** Only extra visits carry these on the visit itself (visit 1/2 use the patient's). */
const EXTRA_ONLY_FIELD_KINDS: Record<string, FieldKind> = {
  label: "requiredText",
  treatment: "text",
  notes: "text",
};

/** Saves some of a patient's own fields (one card of the patient page) — the rest stay as
 * they are. Logged like a full save, and marking needs_visit2 off is refused while visit 2
 * still has money on it. */
export async function updatePatientFields(id: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const input = cleanPatch(patch, PATIENT_FIELD_KINDS);
  const before = await getPatient(supabase, id);
  if (!before) throw new Error(await st("Patient not found"));
  if (input.needs_visit2 === false && before.needs_visit2) {
    const v2 = (x: { visit_number: 1 | 2 | null }) => x.visit_number === 2;
    if (before.payments.some(v2) || before.extras.some(v2)) {
      throw new Error(await st("Visit 2 has payments or extras — move or delete them first"));
    }
  }

  const { error } = await supabase.from("patients").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  const changes = diffFields(before, { ...before, ...input }, PATIENT_AUDIT_FIELDS);
  if (changes) await logActivity(supabase, user.actorId, "patient_updated", "patient", id, changes);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/earnings");
}

/** Saves some fields of one visit — "visit1" | "visit2" | an extra visit's id — e.g. just the
 * travel card, the price, or the status. Marking visit 1 completed creates the "book visit 2"
 * task exactly like a full save does. */
export async function updateVisitFields(patientId: string, visitKey: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  if (visitKey === "visit1" || visitKey === "visit2") {
    const cleaned = cleanPatch(patch, VISIT_FIELD_KINDS);
    const input = Object.fromEntries(Object.entries(cleaned).map(([k, v]) => [`${visitKey}_${k}`, v]));
    const before = await getPatient(supabase, patientId);
    if (!before) throw new Error(await st("Patient not found"));

    const { error } = await supabase.from("patients").update(input).eq("id", patientId);
    if (error) throw new Error(error.message);

    const after = { ...before, ...input } as Patient;
    const changes = diffFields(before, after, PATIENT_AUDIT_FIELDS);
    if (changes) await logActivity(supabase, user.actorId, "patient_updated", "patient", patientId, changes);
    if (before.visit1_status !== "completed" && after.visit1_status === "completed") {
      await maybeCreateFollowUpTask(patientId, await followUpOwner(supabase, before, user.id), after);
    }
  } else {
    const cleaned = cleanPatch(patch, { ...VISIT_FIELD_KINDS, ...EXTRA_ONLY_FIELD_KINDS });
    const input = Object.fromEntries(Object.entries(cleaned).map(([k, v]) => [k === "date" ? "visit_date" : k, v]));
    const { data: before } = await supabase
      .from("patient_visits")
      .select("*")
      .eq("id", visitKey)
      .eq("patient_id", patientId)
      .maybeSingle<PatientExtraVisit>();
    if (!before) throw new Error(await st("Visit not found"));

    const { error } = await supabase.from("patient_visits").update(input).eq("id", visitKey);
    if (error) throw new Error(error.message);

    const changes = diffFields(before, { ...before, ...input }, EXTRA_VISIT_AUDIT_FIELDS);
    if (changes) {
      await logActivity(supabase, user.actorId, "visit_updated", "patient", patientId, `${before.label}: ${changes}`);
    }
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/earnings");
  revalidatePath("/transfers");
}

export async function sendPatientTelegramMessage(id: string, visitKey: string) {
  const supabase = await createClient();
  const user = await requirePermission("patients.view");

  const patient = await getPatient(supabase, id);
  if (!patient) throw new Error(await st("Patient not found"));

  const chatIds = await getRecipientChatIds(supabase, [patient.responsible_seller_id, patient.coordinator_id]);
  if (chatIds.length === 0) throw new Error(await st("No Telegram chat linked for this patient's seller or coordinator"));
  await sendTelegramMessageToMany(chatIds, buildVisitMessage(patient, visitKey));

  await logActivity(supabase, user.actorId, "patient_telegram_sent", "patient", id, visitKey);
}

/** The Sale card on the patient page, saved as one: confirmation date, Komo reference,
 * seller and coordinator. One update, so the card never ends up half-saved.
 * - Seller: only the patient's own seller or someone with sellers.assign may change it (a new
 *   typed name needs sellers.assign too — resolveSellerChoice / RLS).
 * - Coordinator: anyone who can edit the patient; the database checks the new coordinator is
 *   an active member of this clinic with patients.edit. */
export async function updatePatientSale(
  id: string,
  input: {
    confirmation_date: string;
    komo_reference: string;
    /** Left out when the seller isn't being changed. */
    seller?: SellerChoice;
    /** "" = no coordinator; left out when not being changed. */
    coordinatorId?: string;
  }
) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const before = await getPatient(supabase, id);
  if (!before) throw new Error(await st("Patient not found"));
  const update: Record<string, unknown> = cleanPatch(
    { confirmation_date: input.confirmation_date, komo_reference: input.komo_reference },
    PATIENT_FIELD_KINDS
  );

  let reassignedTo: string | null = null;
  const choice = input.seller;
  if (choice && (choice.newSellerName || (choice.sellerId && choice.sellerId !== before.responsible_seller_id))) {
    if (!can(user.viewer, "sellers.assign") && before.responsible_seller_id !== user.id) {
      throw new Error(await st("Only the patient's seller or a coordinator can reassign it"));
    }
    const seller = await resolveSellerChoice(supabase, choice, "");
    if (seller.id !== before.responsible_seller_id) {
      update.responsible_seller_id = seller.id;
      reassignedTo = seller.id;
    }
  }

  let coordinatorChanged = false;
  if (input.coordinatorId !== undefined) {
    const next = input.coordinatorId && UUID_RE.test(input.coordinatorId) ? input.coordinatorId : null;
    if (input.coordinatorId && !next) throw new Error(await st("Team member not found"));
    if (next !== before.coordinator_id) {
      update.coordinator_id = next;
      coordinatorChanged = true;
    }
  }

  const { error } = await supabase.from("patients").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  const changes = diffFields(before, { ...before, ...update }, PATIENT_AUDIT_FIELDS);
  if (changes) await logActivity(supabase, user.actorId, "patient_updated", "patient", id, changes);
  if (reassignedTo) await logActivity(supabase, user.actorId, "patient_reassigned", "patient", id, reassignedTo);
  if (coordinatorChanged) {
    await logActivity(supabase, user.actorId, "patient_updated", "patient", id, update.coordinator_id ? "coordinator changed" : "coordinator removed");
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/tasks");
  if (reassignedTo) {
    revalidatePath("/earnings");
    revalidatePath("/sales-performance");
  }
}

export async function deletePatient(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  // Grab the name before it's gone — the log has to be self-contained since the patient
  // row (and any later name lookup by id) won't exist anymore.
  const patient = await getPatient(supabase, id);
  if (!patient) throw new Error(await st("Patient not found"));
  if (!can(user.viewer, "patients.delete") && patient.responsible_seller_id !== user.id) {
    throw new Error(await st("Only the patient's own seller or an admin can delete this patient"));
  }

  // their files go with them: rows cascade, the stored files are removed here
  const { data: files } = await supabase.from("patient_files").select("path").eq("patient_id", id);

  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (files?.length) {
    const { error: removeError } = await createAdminClient()
      .storage.from(PATIENT_FILE_BUCKET)
      .remove(files.map((f) => f.path as string));
    if (removeError) console.error("Removing a deleted patient's files failed:", removeError.message);
  }

  await logActivity(supabase, user.actorId, "patient_deleted", "patient", id, patient?.name ?? undefined);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
}

function parseExtraVisitInput(formData: FormData) {
  const num = (key: string) => {
    const v = formData.get(key);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (key: string) => {
    const v = formData.get(key);
    return v == null || v === "" ? null : String(v);
  };

  return {
    label: String(formData.get("label") ?? "").trim(),
    visit_date: str("visit_date"),
    expected: num("expected"),
    status: (formData.get("status") as "upcoming" | "completed") || "upcoming",
    pax: parsePax(formData.get("pax")),
    treatment: str("treatment"),
    notes: str("notes"),
    arrival_date: str("arrival_date"),
    arrival_time: str("arrival_time"),
    arrival_flight_no: str("arrival_flight_no"),
    departure_date: str("departure_date"),
    departure_time: str("departure_time"),
    departure_flight_no: str("departure_flight_no"),
    hotel_name: str("hotel_name"),
    room_type: str("room_type"),
    hotel_cost: num("hotel_cost"),
    hotel_arranged: formData.get("hotel_arranged") === "on",
  };
}

export async function addExtraVisit(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const input = parseExtraVisitInput(formData);
  if (!input.label) throw new Error(await st("Reason is required"));

  const { data, error } = await supabase
    .from("patient_visits")
    .insert({ ...input, patient_id: patientId, created_by_seller_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "visit_added", "patient", patientId, input.label);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  return { id: data.id as string };
}

// Transfer "arranged" flags aren't toggled by hand any more — they follow the transfers
// themselves (DB trigger). Only the hotel booking is still a manual tick.
const PATIENT_LOGISTICS_FIELDS = ["visit1_hotel_arranged", "visit2_hotel_arranged"] as const;
export type PatientLogisticsField = (typeof PATIENT_LOGISTICS_FIELDS)[number];

const PATIENT_LOGISTICS_FIELD_LABELS: Record<PatientLogisticsField, string> = {
  visit1_hotel_arranged: "visit 1 hotel",
  visit2_hotel_arranged: "visit 2 hotel",
};

const EXTRA_VISIT_LOGISTICS_FIELDS = ["hotel_arranged"] as const;
export type ExtraVisitLogisticsField = (typeof EXTRA_VISIT_LOGISTICS_FIELDS)[number];

const EXTRA_VISIT_LOGISTICS_FIELD_LABELS: Record<ExtraVisitLogisticsField, string> = {
  hotel_arranged: "hotel",
};

/** Single-checkbox toggle for the dashboard's "Logistics not arranged" card — a full
 * updatePatient() round trip would require resubmitting every field on the patient, which the
 * dashboard doesn't have loaded. `field` is validated against an allowlist since it crosses
 * the server-action boundary as a plain string, not a type the client can be trusted to respect. */
export async function setPatientLogisticsFlag(patientId: string, field: PatientLogisticsField, value: boolean) {
  if (!PATIENT_LOGISTICS_FIELDS.includes(field)) throw new Error(await st("Invalid field"));
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const { error } = await supabase.from("patients").update({ [field]: value }).eq("id", patientId);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "patient_logistics_toggled",
    "patient",
    patientId,
    `${PATIENT_LOGISTICS_FIELD_LABELS[field]} ${value ? "arranged" : "unarranged"}`
  );

  revalidatePath("/patients");
  revalidatePath("/");
}

/** Same as setPatientLogisticsFlag but for an extra visit's own logistics checkboxes. */
export async function setExtraVisitLogisticsFlag(
  extraVisitId: string,
  field: ExtraVisitLogisticsField,
  value: boolean
) {
  if (!EXTRA_VISIT_LOGISTICS_FIELDS.includes(field)) throw new Error(await st("Invalid field"));
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const { data: visit } = await supabase
    .from("patient_visits")
    .select("patient_id")
    .eq("id", extraVisitId)
    .maybeSingle();

  const { error } = await supabase.from("patient_visits").update({ [field]: value }).eq("id", extraVisitId);
  if (error) throw new Error(error.message);

  if (visit) {
    await logActivity(
      supabase,
      user.actorId,
      "visit_logistics_toggled",
      "patient",
      visit.patient_id,
      `${EXTRA_VISIT_LOGISTICS_FIELD_LABELS[field]} ${value ? "arranged" : "unarranged"}`
    );
  }

  revalidatePath("/patients");
  revalidatePath("/");
}

export async function deleteExtraVisit(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("patients.edit");

  const { data: before } = await supabase
    .from("patient_visits")
    .select("*")
    .eq("id", id)
    .maybeSingle<PatientExtraVisit>();

  // payments go with the visit (on delete cascade) — money recorded must never vanish silently
  const { count } = await supabase
    .from("patient_payments")
    .select("id", { count: "exact", head: true })
    .eq("extra_visit_id", id);
  if (count) throw new Error(await st("This visit has payments — move or delete them first"));

  const { error } = await supabase.from("patient_visits").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    await logActivity(supabase, user.actorId, "visit_deleted", "patient", before.patient_id, before.label);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
}

/** Powers the patient modal's History tab. `activity_log` is admin-only under RLS (see
 * schema.sql), but any active seller can already edit any shared patient record — so seeing
 * that same patient's own audit trail isn't a bigger exposure. Runs with the service-role
 * client to read past RLS, so it must first prove the caller can see this patient at all:
 * the RLS-scoped lookup below returns nothing for another clinic's patient (or for a
 * deactivated account), and the log read is pinned to that same clinic. */
export async function getPatientActivity(patientId: string): Promise<ActivityLogRow[]> {
  const supabase = await createClient();
  const { viewer } = await requirePermission("patients.view", { forRead: true });

  const { data: patient } = await supabase.from("patients").select("clinic_id").eq("id", patientId).maybeSingle();
  if (!patient) throw new Error(await st("Patient not found"));

  // Reading a patient's history in support mode is part of the support access log.
  if (viewer.support) {
    await recordSupportEvent({
      sessionId: viewer.support.sessionId,
      superadminId: viewer.authUserId,
      clinicId: viewer.clinicId,
      event: "record_history_viewed",
      detail: recordRef("patient", patientId) ?? undefined,
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at, via_support, former_actor_id")
    .eq("clinic_id", patient.clinic_id)
    .eq("target_type", "patient")
    .eq("target_id", patientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return data as ActivityLogRow[];
}
