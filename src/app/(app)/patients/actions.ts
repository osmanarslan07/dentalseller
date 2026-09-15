"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "@/lib/data";
import { getFallbackChatId, sendTelegramMessageToMany } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";
import { Patient, PatientExtraVisit, PatientInput } from "@/types";

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

/** Compact human-readable diff of the fields worth auditing on a shared record — money,
 * dates, and status, not every logistics field (arrival flight, hotel, etc). `before` (the
 * full DB row) and `after` (a form-parsed input) are different shapes that merely share
 * these field names, hence the two independent type parameters. */
function diffFields<B, A>(before: B, after: A, fields: { key: keyof B & keyof A; label: string }[]): string {
  const changes: string[] = [];
  for (const { key, label } of fields) {
    const b = (before as Record<string, unknown>)[key as string] ?? null;
    const a = (after as Record<string, unknown>)[key as string] ?? null;
    if (b !== a) changes.push(`${label} ${b ?? "—"} → ${a ?? "—"}`);
  }
  return changes.join(", ");
}

const PATIENT_AUDIT_FIELDS: { key: keyof PatientInput; label: string }[] = [
  { key: "name", label: "name" },
  { key: "treatment", label: "treatment" },
  { key: "confirmation_date", label: "confirmed" },
  { key: "needs_visit2", label: "needs visit 2" },
  { key: "visit1_date", label: "visit1 date" },
  { key: "visit1_expected", label: "visit1 expected" },
  { key: "visit1_actual", label: "visit1 actual" },
  { key: "visit1_status", label: "visit1 status" },
  { key: "visit2_date", label: "visit2 date" },
  { key: "visit2_expected", label: "visit2 expected" },
  { key: "visit2_actual", label: "visit2 actual" },
  { key: "visit2_status", label: "visit2 status" },
];

const EXTRA_VISIT_AUDIT_FIELDS: { key: keyof ReturnType<typeof parseExtraVisitInput>; label: string }[] = [
  { key: "label", label: "label" },
  { key: "visit_date", label: "date" },
  { key: "expected", label: "expected" },
  { key: "actual", label: "actual" },
  { key: "status", label: "status" },
  { key: "treatment", label: "treatment" },
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
    visit2_arrival_date: str("visit2_arrival_date"),
    visit2_arrival_time: str("visit2_arrival_time"),
    visit2_arrival_flight_no: str("visit2_arrival_flight_no"),
    visit2_departure_date: str("visit2_departure_date"),
    visit2_departure_time: str("visit2_departure_time"),
    visit2_departure_flight_no: str("visit2_departure_flight_no"),
    visit2_hotel_name: str("visit2_hotel_name"),
    visit2_room_type: str("visit2_room_type"),
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

  try {
    const chatIds = await getRecipientChatIds(supabase, user.id);
    if (chatIds.length > 0) await sendTelegramMessageToMany(chatIds, buildNewPatientMessage(input));
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
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
  }

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

export async function sendPatientTelegramMessage(id: string, visitKey: string) {
  const supabase = await createClient();
  const patient = await getPatient(supabase, id);
  if (!patient) throw new Error("Patient not found");

  const chatIds = await getRecipientChatIds(supabase, patient.responsible_seller_id);
  if (chatIds.length === 0) throw new Error("No Telegram chat linked for this patient's seller");
  await sendTelegramMessageToMany(chatIds, buildVisitMessage(patient, visitKey));
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
