"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { getActingUser } from "@/lib/viewer";
import { visitLabel, visitRef } from "@/lib/visit-key";
import { PatientExtraKind } from "@/types";

const KINDS: PatientExtraKind[] = ["night", "treatment", "other"];
const KIND_NAMES: Record<PatientExtraKind, string> = {
  night: "extra night",
  treatment: "extra treatment",
  other: "extra",
};

function parseExtra(formData: FormData) {
  const kind = String(formData.get("kind") ?? "") as PatientExtraKind;
  if (!KINDS.includes(kind)) throw new Error("Pick what was sold");

  const description = String(formData.get("description") ?? "").trim() || null;
  if (kind !== "night" && !description) throw new Error("Describe the extra, e.g. “2x zirconium crown”");

  const quantity = Number(formData.get("quantity"));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be more than 0");
  const unit_price = Number(formData.get("unit_price"));
  if (!Number.isFinite(unit_price) || unit_price < 0) throw new Error("Price must be a positive number");

  return { kind, description, quantity, unit_price };
}

function describe(e: { kind: PatientExtraKind; description: string | null; quantity: number; unit_price: number }) {
  return `${e.quantity} × ${e.description || KIND_NAMES[e.kind]} @ £${e.unit_price}`;
}

function revalidate(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
}

export async function addPatientExtra(patientId: string, visitKey: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseExtra(formData);
  const { error } = await supabase.from("patient_extras").insert({ ...input, ...visitRef(visitKey), patient_id: patientId });
  if (error) throw new Error(error.message);

  const patient = await getPatient(supabase, patientId);
  await logActivity(
    supabase,
    user.actorId,
    "extra_added",
    "patient",
    patientId,
    `${visitLabel(visitKey, patient?.extra_visits ?? [])}: ${describe(input)}`
  );
  revalidate(patientId);
}

export async function updatePatientExtra(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseExtra(formData);
  const { data, error } = await supabase.from("patient_extras").update(input).eq("id", id).select("patient_id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "extra_updated", "patient", data.patient_id, describe(input));
  revalidate(data.patient_id);
}

export async function deletePatientExtra(id: string) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { data, error } = await supabase
    .from("patient_extras")
    .delete()
    .eq("id", id)
    .select("patient_id, kind, description, quantity, unit_price")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "extra_deleted",
    "patient",
    data.patient_id,
    describe({ ...data, quantity: Number(data.quantity), unit_price: Number(data.unit_price) })
  );
  revalidate(data.patient_id);
}
