"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { getActingUser } from "@/lib/viewer";
import { Patient, TransferKind, TransferStatus } from "@/types";

/** Places offered (and used by "Suggest transfers") alongside the visit's hotel. */
const AIRPORT = "Airport";
const CLINIC = "Clinic";

const KINDS: TransferKind[] = ["arrival", "departure", "local"];
const STATUSES: TransferStatus[] = ["planned", "sent", "done"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "visit1" | "visit2" | an extra visit's id — the same keys the Telegram menu uses. */
function visitRef(visitKey: string): { visit_number: 1 | 2 | null; extra_visit_id: string | null } {
  if (visitKey === "visit1") return { visit_number: 1, extra_visit_id: null };
  if (visitKey === "visit2") return { visit_number: 2, extra_visit_id: null };
  return { visit_number: null, extra_visit_id: visitKey };
}

function visitName(patient: Patient | null, visitKey: string): string {
  if (visitKey === "visit1") return "Visit 1";
  if (visitKey === "visit2") return "Visit 2";
  return patient?.extra_visits.find((v) => v.id === visitKey)?.label ?? "Extra visit";
}

function parseTransfer(formData: FormData) {
  const str = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v || null;
  };

  const kind = str("kind") as TransferKind | null;
  if (!kind || !KINDS.includes(kind)) throw new Error("Pick a transfer type");
  const status = (str("status") as TransferStatus | null) ?? "planned";
  if (!STATUSES.includes(status)) throw new Error("Invalid status");

  const transfer_time = str("transfer_time");
  if (transfer_time && !TIME_RE.test(transfer_time)) throw new Error("Use 24-hour time, e.g. 14:30");

  const paxRaw = Math.round(Number(formData.get("pax")));
  const pax = Number.isFinite(paxRaw) && paxRaw >= 1 ? Math.min(paxRaw, 50) : 1;

  const costRaw = str("cost");
  const cost = costRaw == null ? null : Number(costRaw);
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error("Cost must be a positive number");

  const company_id = str("company_id");
  return {
    kind,
    status,
    transfer_date: str("transfer_date"),
    transfer_time,
    from_place: str("from_place"),
    to_place: str("to_place"),
    pax,
    company_id,
    // a driver only makes sense with their company; the DB also checks they match
    driver_id: company_id ? str("driver_id") : null,
    flight_no: str("flight_no"),
    cost,
    notes: str("notes"),
  };
}

function describe(t: { from_place: string | null; to_place: string | null; transfer_date: string | null; transfer_time: string | null }) {
  const route = `${t.from_place ?? "?"} → ${t.to_place ?? "?"}`;
  const when = t.transfer_date ? ` ${t.transfer_date.split("-").reverse().join(".")}${t.transfer_time ? ` ${t.transfer_time}` : ""}` : "";
  return `${route}${when}`;
}

function revalidate(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function addTransfer(patientId: string, visitKey: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseTransfer(formData);
  const { error } = await supabase.from("transfers").insert({ ...input, ...visitRef(visitKey), patient_id: patientId });
  if (error) throw new Error(error.message);

  const patient = await getPatient(supabase, patientId);
  await logActivity(supabase, user.actorId, "transfer_added", "patient", patientId, `${visitName(patient, visitKey)}: ${describe(input)}`);
  revalidate(patientId);
}

export async function updateTransfer(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseTransfer(formData);
  const { data, error } = await supabase.from("transfers").update(input).eq("id", id).select("patient_id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "transfer_updated", "patient", data.patient_id, describe(input));
  revalidate(data.patient_id);
}

export async function deleteTransfer(id: string) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { data, error } = await supabase
    .from("transfers")
    .delete()
    .eq("id", id)
    .select("patient_id, from_place, to_place, transfer_date, transfer_time")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "transfer_deleted", "patient", data.patient_id, describe(data));
  revalidate(data.patient_id);
}

/** Pre-fills the usual journeys from the visit's flights and hotel — airport → hotel on
 * arrival, hotel → clinic on the visit day, hotel → airport on departure — skipping any type
 * the visit already has. Created without a driver; operations assigns one on each. */
export async function suggestTransfers(patientId: string, visitKey: string): Promise<{ created: number }> {
  const supabase = await createClient();
  const user = await getActingUser();

  const patient = await getPatient(supabase, patientId);
  if (!patient) throw new Error("Patient not found");

  let visit: {
    date: string | null;
    arrivalDate: string | null;
    arrivalTime: string | null;
    arrivalFlight: string | null;
    departureDate: string | null;
    departureTime: string | null;
    departureFlight: string | null;
    hotel: string | null;
    pax: number;
  };
  if (visitKey === "visit1" || visitKey === "visit2") {
    const n = visitKey === "visit1" ? 1 : 2;
    visit = {
      date: patient[`visit${n}_date`],
      arrivalDate: patient[`visit${n}_arrival_date`],
      arrivalTime: patient[`visit${n}_arrival_time`],
      arrivalFlight: patient[`visit${n}_arrival_flight_no`],
      departureDate: patient[`visit${n}_departure_date`],
      departureTime: patient[`visit${n}_departure_time`],
      departureFlight: patient[`visit${n}_departure_flight_no`],
      hotel: patient[`visit${n}_hotel_name`],
      pax: patient[`visit${n}_pax`],
    };
  } else {
    const v = patient.extra_visits.find((x) => x.id === visitKey);
    if (!v) throw new Error("Visit not found");
    visit = {
      date: v.visit_date,
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

  const ref = visitRef(visitKey);
  let existingQuery = supabase.from("transfers").select("kind").eq("patient_id", patientId);
  existingQuery = ref.extra_visit_id
    ? existingQuery.eq("extra_visit_id", ref.extra_visit_id)
    : existingQuery.eq("visit_number", ref.visit_number!);
  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) throw new Error(existingError.message);
  const has = new Set((existing ?? []).map((t) => t.kind as TransferKind));

  const hotel = visit.hotel || "Hotel";
  const rows = [];
  if (!has.has("arrival") && visit.arrivalDate) {
    rows.push({
      kind: "arrival",
      transfer_date: visit.arrivalDate,
      transfer_time: visit.arrivalTime,
      from_place: AIRPORT,
      to_place: hotel,
      flight_no: visit.arrivalFlight,
    });
  }
  if (!has.has("local") && visit.date) {
    rows.push({ kind: "local", transfer_date: visit.date, transfer_time: null, from_place: hotel, to_place: CLINIC, flight_no: null });
  }
  if (!has.has("departure") && visit.departureDate) {
    rows.push({
      kind: "departure",
      transfer_date: visit.departureDate,
      transfer_time: null,
      from_place: hotel,
      to_place: AIRPORT,
      flight_no: visit.departureFlight,
      notes: visit.departureTime ? `Flight departs ${visit.departureTime}` : null,
    });
  }
  if (rows.length === 0) return { created: 0 };

  const { error } = await supabase
    .from("transfers")
    .insert(rows.map((r) => ({ ...r, ...ref, patient_id: patientId, pax: visit.pax })));
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "transfer_added",
    "patient",
    patientId,
    `${visitName(patient, visitKey)}: ${rows.length} suggested`
  );
  revalidate(patientId);
  return { created: rows.length };
}

/** Called right after the WhatsApp message to the driver is opened — the message itself is
 * sent from the user's own WhatsApp, so this only records that it went out. A transfer
 * already marked done stays done. */
export async function markTransferSent(id: string) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { data: current, error: readError } = await supabase
    .from("transfers")
    .select("patient_id, status, from_place, to_place, transfer_date, transfer_time, driver:drivers(name)")
    .eq("id", id)
    .single();
  if (readError) throw new Error(readError.message);

  const { error } = await supabase
    .from("transfers")
    .update({ status: current.status === "done" ? "done" : "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const driver = current.driver as unknown as { name: string } | null;
  await logActivity(
    supabase,
    user.actorId,
    "transfer_sent",
    "patient",
    current.patient_id,
    `${describe(current)}${driver ? ` → ${driver.name}` : ""}`
  );
  revalidate(current.patient_id);
}
