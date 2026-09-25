"use server";

import { msg } from "@/i18n";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { visitLabel, visitRef } from "@/lib/visit-key";
import { PatientExtraKind } from "@/types";
import { requirePermission } from "@/lib/permissions";
import { plainAmount } from "@/lib/money";

const KINDS: PatientExtraKind[] = ["night", "treatment", "other"];
const KIND_NAMES: Record<PatientExtraKind, string> = {
  night: "extra night",
  treatment: "extra treatment",
  other: "extra",
};

function parseExtra(formData: FormData) {
  const kind = String(formData.get("kind") ?? "") as PatientExtraKind;
  if (!KINDS.includes(kind)) throw new Error(msg("Pick what was sold"));

  const description = String(formData.get("description") ?? "").trim() || null;
  if (kind !== "night" && !description) throw new Error(msg("Describe the extra, e.g. “2x zirconium crown”"));

  const quantity = Number(formData.get("quantity"));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(msg("Quantity must be more than 0"));
  const unit_price = Number(formData.get("unit_price"));
  if (!Number.isFinite(unit_price) || unit_price < 0) throw new Error(msg("Price must be a positive number"));

  return { kind, description, quantity, unit_price };
}

/** "2 × Extra night @ £80" — in the patient's deal currency. */
function describe(e: { kind: PatientExtraKind; description: string | null; quantity: number; unit_price: number }, currency: string) {
  return `${e.quantity} × ${e.description || KIND_NAMES[e.kind]} @ ${plainAmount(e.unit_price, currency)}`;
}

/** The deal currency of the patient an extra belongs to. */
async function patientCurrency(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string): Promise<string> {
  const { data } = await supabase.from("patients").select("currency").eq("id", patientId).maybeSingle();
  return data?.currency ?? "GBP";
}

function revalidate(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
}

export async function addPatientExtra(patientId: string, visitKey: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("money.edit");

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
    `${visitLabel(visitKey, patient?.extra_visits ?? [])}: ${describe(input, patient?.currency ?? (await patientCurrency(supabase, patientId)))}`
  );
  revalidate(patientId);
}

export async function updatePatientExtra(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("money.edit");

  const input = parseExtra(formData);
  const { data, error } = await supabase.from("patient_extras").update(input).eq("id", id).select("patient_id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "extra_updated", "patient", data.patient_id, describe(input, await patientCurrency(supabase, data.patient_id)));
  revalidate(data.patient_id);
}

export async function deletePatientExtra(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("money.edit");

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
    describe({ ...data, quantity: Number(data.quantity), unit_price: Number(data.unit_price) }, await patientCurrency(supabase, data.patient_id))
  );
  revalidate(data.patient_id);
}
