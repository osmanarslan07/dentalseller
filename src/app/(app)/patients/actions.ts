"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { addMonths, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPatient } from "@/lib/data";
import { getFallbackChatId, sendTelegramMessageToMany } from "@/lib/telegram";
import { ActivityLogRow, diffFields, logActivity } from "@/lib/activity-log";
import { Patient, PatientExtraVisit, PatientInput } from "@/types";

/** Built from local Y/M/D components on both ends (never via `new Date(isoString)`, which
 * parses as UTC) so this can't drift a day depending on the server's timezone offset. */
function addMonthsToDateString(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, d), months), "yyyy-MM-dd");
}

/** Auto-creates the "book visit 2" reminder the moment visit 1 is marked completed — no
 * button, no manual step. Runs with the service-role client since the task has to belong to
 * the patient's responsible seller, who may not be whoever's saving this particular edit
 * (any active seller can update a shared patient record). Best-effort: a failure here
 * should never break the patient save it's attached to. */
async function maybeCreateFollowUpTask(patientId: string, responsibleSellerId: string, input: PatientInput) {
  if (!(input.visit1_status === "completed" && input.needs_visit2 && input.visit1_date && !input.visit2_date)) return;
  try {
    const admin = createAdminClient();
    const title = `Book visit 2 — ${input.name}`;
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("patient_id", patientId)
      .eq("user_id", responsibleSellerId)
      .eq("status", "pending")
      .eq("title", title)
      .maybeSingle();
    if (existing) return;

    const dueDate = addMonthsToDateString(input.visit1_date, input.visit2_recall_months);
    await admin.from("tasks").insert({
      user_id: responsibleSellerId,
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

/** The responsible seller's own chat plus the clinic-wide fallback (deduped) — so a
 * notification never silently disappears just because a seller hasn't linked Telegram yet. */
async function getRecipientChatIds(supabase: SupabaseClient, sellerId: string): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("telegram_chat_id").eq("id", sellerId).maybeSingle();
  const ids = new Set<string>();
  if (data?.telegram_chat_id) ids.add(data.telegram_chat_id);
  const fallback = getFallbackChatId();
  if (fallback) ids.add(fallback);
  return [...ids];
}

const PATIENT_AUDIT_FIELDS: { key: keyof PatientInput; label: string }[] = [
  { key: "name", label: "name" },
  { key: "treatment", label: "treatment" },
  { key: "notes", label: "notes" },
  { key: "komo_reference", label: "komo reference" },
  { key: "confirmation_date", label: "confirmed" },
  { key: "needs_visit2", label: "needs visit 2" },
  { key: "visit2_recall_months", label: "visit2 recall months" },

  { key: "visit1_date", label: "visit1 date" },
  { key: "visit1_expected", label: "visit1 expected" },
  { key: "visit1_actual", label: "visit1 actual" },
  { key: "visit1_status", label: "visit1 status" },
  { key: "visit1_arrival_date", label: "visit1 arrival date" },
  { key: "visit1_arrival_time", label: "visit1 arrival time" },
  { key: "visit1_arrival_flight_no", label: "visit1 arrival flight" },
  { key: "visit1_departure_date", label: "visit1 departure date" },
  { key: "visit1_departure_time", label: "visit1 departure time" },
  { key: "visit1_departure_flight_no", label: "visit1 departure flight" },
  { key: "visit1_hotel_name", label: "visit1 hotel" },
  { key: "visit1_room_type", label: "visit1 room type" },
  { key: "visit1_arrival_transfer_arranged", label: "visit1 arrival transfer" },
  { key: "visit1_departure_transfer_arranged", label: "visit1 departure transfer" },
  { key: "visit1_hotel_arranged", label: "visit1 hotel arranged" },

  { key: "visit2_date", label: "visit2 date" },
  { key: "visit2_expected", label: "visit2 expected" },
  { key: "visit2_actual", label: "visit2 actual" },
  { key: "visit2_status", label: "visit2 status" },
  { key: "visit2_arrival_date", label: "visit2 arrival date" },
  { key: "visit2_arrival_time", label: "visit2 arrival time" },
  { key: "visit2_arrival_flight_no", label: "visit2 arrival flight" },
  { key: "visit2_departure_date", label: "visit2 departure date" },
  { key: "visit2_departure_time", label: "visit2 departure time" },
  { key: "visit2_departure_flight_no", label: "visit2 departure flight" },
  { key: "visit2_hotel_name", label: "visit2 hotel" },
  { key: "visit2_room_type", label: "visit2 room type" },
  { key: "visit2_arrival_transfer_arranged", label: "visit2 arrival transfer" },
  { key: "visit2_departure_transfer_arranged", label: "visit2 departure transfer" },
  { key: "visit2_hotel_arranged", label: "visit2 hotel arranged" },
];

const EXTRA_VISIT_AUDIT_FIELDS: { key: keyof ReturnType<typeof parseExtraVisitInput>; label: string }[] = [
  { key: "label", label: "label" },
  { key: "visit_date", label: "date" },
  { key: "expected", label: "expected" },
  { key: "actual", label: "actual" },
  { key: "status", label: "status" },
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
  { key: "arrival_transfer_arranged", label: "arrival transfer" },
  { key: "departure_transfer_arranged", label: "departure transfer" },
  { key: "hotel_arranged", label: "hotel arranged" },
];

function formatDateTime(date: string | null, time: string | null) {
  if (!date) return null;
  const [y, m, d] = date.split("-");
  const datePart = `${d}.${m}.${y}`;
  return time ? `${datePart} ${time}` : datePart;
}

/** Actual takes priority — once a payment is received, that's the number that matters. */
function paymentLine(label: string, actual: number | null, expected: number | null): string | null {
  if (actual != null) return `<b>${label} (alındı):</b> £${actual}`;
  if (expected != null) return `<b>${label} (beklenen):</b> £${expected}`;
  return null;
}

function amountOf(actual: number | null, expected: number | null): number {
  return actual ?? expected ?? 0;
}

function buildNewPatientMessage(input: PatientInput): string {
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
    input.visit1_expected != null ? `<b>İlk visit ödeme:</b> £${input.visit1_expected}` : null,
    input.needs_visit2 && input.visit2_expected != null ? `<b>İkinci visit ödeme:</b> £${input.visit2_expected}` : null,
    total ? `<b>Toplam Ödeme:</b> £${total}` : null,
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
    if (!extra) throw new Error("Visit not found");
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
  const paymentLines: (string | null)[] = [];
  if (visitKey === "visit1") {
    paymentLines.push(paymentLine("İlk visit ödeme", actual, expected));
    if (patient.needs_visit2) {
      paymentLines.push(paymentLine("İkinci visit ödeme", patient.visit2_actual, patient.visit2_expected));
      const total = amountOf(actual, expected) + amountOf(patient.visit2_actual, patient.visit2_expected);
      if (total > 0) paymentLines.push(`<b>Toplam Ödeme:</b> £${total}`);
    }
  } else if (visitKey === "visit2") {
    paymentLines.push(paymentLine("İlk visit ödeme", patient.visit1_actual, patient.visit1_expected));
    paymentLines.push(paymentLine("İkinci visit ödeme", actual, expected));
    const total = amountOf(patient.visit1_actual, patient.visit1_expected) + amountOf(actual, expected);
    if (total > 0) paymentLines.push(`<b>Toplam Ödeme:</b> £${total}`);
  } else {
    paymentLines.push(paymentLine("Ödeme", actual, expected));
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
    visit1_actual: num("visit1_actual"),
    visit1_status: (formData.get("visit1_status") as "upcoming" | "completed") || "upcoming",
    visit2_date: str("visit2_date"),
    visit2_expected: num("visit2_expected"),
    visit2_actual: num("visit2_actual"),
    visit2_status: (formData.get("visit2_status") as "upcoming" | "completed") || "upcoming",
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
    visit1_arrival_transfer_arranged: formData.get("visit1_arrival_transfer_arranged") === "on",
    visit1_departure_transfer_arranged: formData.get("visit1_departure_transfer_arranged") === "on",
    visit1_hotel_arranged: formData.get("visit1_hotel_arranged") === "on",
    visit2_arrival_date: str("visit2_arrival_date"),
    visit2_arrival_time: str("visit2_arrival_time"),
    visit2_arrival_flight_no: str("visit2_arrival_flight_no"),
    visit2_departure_date: str("visit2_departure_date"),
    visit2_departure_time: str("visit2_departure_time"),
    visit2_departure_flight_no: str("visit2_departure_flight_no"),
    visit2_hotel_name: str("visit2_hotel_name"),
    visit2_room_type: str("visit2_room_type"),
    visit2_arrival_transfer_arranged: formData.get("visit2_arrival_transfer_arranged") === "on",
    visit2_departure_transfer_arranged: formData.get("visit2_departure_transfer_arranged") === "on",
    visit2_hotel_arranged: formData.get("visit2_hotel_arranged") === "on",
  };
}

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { data: created, error } = await supabase
    .from("patients")
    .insert({ ...input, responsible_seller_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "patient_created", "patient", created?.id ?? null, input.name);

  if (created?.id) await maybeCreateFollowUpTask(created.id, user.id, input);

  try {
    const chatIds = await getRecipientChatIds(supabase, user.id);
    if (chatIds.length > 0) await sendTelegramMessageToMany(chatIds, buildNewPatientMessage(input));
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
  revalidatePath("/tasks");
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  // Shared patients can be edited by any active seller — snapshot the before-state so the
  // audit log records who actually changed money/date/status fields, not just that "someone did".
  const before = await getPatient(supabase, id);

  const { error } = await supabase.from("patients").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    const changes = diffFields(before, input, PATIENT_AUDIT_FIELDS);
    if (changes) await logActivity(supabase, user.id, "patient_updated", "patient", id, changes);

    // Only on the actual upcoming → completed transition — not on every subsequent save of
    // an already-completed visit 1, which would otherwise re-check (and re-skip) every time.
    if (before.visit1_status !== "completed" && input.visit1_status === "completed") {
      await maybeCreateFollowUpTask(id, before.responsible_seller_id, input);
    }
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projections");
}

export async function sendPatientTelegramMessage(id: string, visitKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const patient = await getPatient(supabase, id);
  if (!patient) throw new Error("Patient not found");

  const chatIds = await getRecipientChatIds(supabase, patient.responsible_seller_id);
  if (chatIds.length === 0) throw new Error("No Telegram chat linked for this patient's seller");
  await sendTelegramMessageToMany(chatIds, buildVisitMessage(patient, visitKey));

  await logActivity(supabase, user.id, "patient_telegram_sent", "patient", id, visitKey);
}

/** Hands the patient to another seller — they earn commission on any visit not yet paid.
 * A DB trigger locks in credit for visits already paid before the handoff, so this never
 * moves commission the previous seller already earned (see visit*_earned_by_seller_id).
 * A separate DB trigger enforces that only the current responsible seller or an admin may
 * reassign at all. */
export async function reassignPatient(id: string, newSellerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("patients")
    .update({ responsible_seller_id: newSellerId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "patient_reassigned", "patient", id, newSellerId);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

export async function deletePatient(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Grab the name before it's gone — the log has to be self-contained since the patient
  // row (and any later name lookup by id) won't exist anymore.
  const patient = await getPatient(supabase, id);

  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "patient_deleted", "patient", id, patient?.name ?? undefined);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
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
    actual: num("actual"),
    status: (formData.get("status") as "upcoming" | "completed") || "upcoming",
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
    arrival_transfer_arranged: formData.get("arrival_transfer_arranged") === "on",
    departure_transfer_arranged: formData.get("departure_transfer_arranged") === "on",
    hotel_arranged: formData.get("hotel_arranged") === "on",
  };
}

export async function addExtraVisit(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseExtraVisitInput(formData);
  if (!input.label) throw new Error("Reason is required");

  const { error } = await supabase
    .from("patient_visits")
    .insert({ ...input, patient_id: patientId, created_by_seller_id: user.id });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "visit_added", "patient", patientId, input.label);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

export async function updateExtraVisit(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseExtraVisitInput(formData);
  if (!input.label) throw new Error("Reason is required");

  const { data: before } = await supabase
    .from("patient_visits")
    .select("*")
    .eq("id", id)
    .maybeSingle<PatientExtraVisit>();

  const { error } = await supabase.from("patient_visits").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    const changes = diffFields(before, input, EXTRA_VISIT_AUDIT_FIELDS);
    if (changes) await logActivity(supabase, user.id, "visit_updated", "patient", before.patient_id, changes);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

const PATIENT_LOGISTICS_FIELDS = [
  "visit1_arrival_transfer_arranged",
  "visit1_departure_transfer_arranged",
  "visit1_hotel_arranged",
  "visit2_arrival_transfer_arranged",
  "visit2_departure_transfer_arranged",
  "visit2_hotel_arranged",
] as const;
export type PatientLogisticsField = (typeof PATIENT_LOGISTICS_FIELDS)[number];

const PATIENT_LOGISTICS_FIELD_LABELS: Record<PatientLogisticsField, string> = {
  visit1_arrival_transfer_arranged: "visit 1 arrival transfer",
  visit1_departure_transfer_arranged: "visit 1 departure transfer",
  visit1_hotel_arranged: "visit 1 hotel",
  visit2_arrival_transfer_arranged: "visit 2 arrival transfer",
  visit2_departure_transfer_arranged: "visit 2 departure transfer",
  visit2_hotel_arranged: "visit 2 hotel",
};

const EXTRA_VISIT_LOGISTICS_FIELDS = [
  "arrival_transfer_arranged",
  "departure_transfer_arranged",
  "hotel_arranged",
] as const;
export type ExtraVisitLogisticsField = (typeof EXTRA_VISIT_LOGISTICS_FIELDS)[number];

const EXTRA_VISIT_LOGISTICS_FIELD_LABELS: Record<ExtraVisitLogisticsField, string> = {
  arrival_transfer_arranged: "arrival transfer",
  departure_transfer_arranged: "departure transfer",
  hotel_arranged: "hotel",
};

/** Single-checkbox toggle for the dashboard's "Logistics not arranged" card — a full
 * updatePatient() round trip would require resubmitting every field on the patient, which the
 * dashboard doesn't have loaded. `field` is validated against an allowlist since it crosses
 * the server-action boundary as a plain string, not a type the client can be trusted to respect. */
export async function setPatientLogisticsFlag(patientId: string, field: PatientLogisticsField, value: boolean) {
  if (!PATIENT_LOGISTICS_FIELDS.includes(field)) throw new Error("Invalid field");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("patients").update({ [field]: value }).eq("id", patientId);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.id,
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
  if (!EXTRA_VISIT_LOGISTICS_FIELDS.includes(field)) throw new Error("Invalid field");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

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
      user.id,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: before } = await supabase
    .from("patient_visits")
    .select("*")
    .eq("id", id)
    .maybeSingle<PatientExtraVisit>();

  const { error } = await supabase.from("patient_visits").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    await logActivity(supabase, user.id, "visit_deleted", "patient", before.patient_id, before.label);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

/** Powers the patient modal's History tab. `activity_log` is admin-only under RLS (see
 * schema.sql), but any active seller can already edit any shared patient record — so seeing
 * that same patient's own audit trail isn't a bigger exposure. Runs with the service-role
 * client to read past RLS, but stays scoped to this one patient's rows only. */
export async function getPatientActivity(patientId: string): Promise<ActivityLogRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at")
    .eq("target_type", "patient")
    .eq("target_id", patientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return data as ActivityLogRow[];
}
