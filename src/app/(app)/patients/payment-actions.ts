"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatient, getPatients, getSettings } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { detectTierJump } from "@/lib/commission";
import { visitLabel, visitRef } from "@/lib/visit-key";
import { Celebration, Patient, PaymentMethod } from "@/types";
import { requirePermission } from "@/lib/permissions";

const METHODS: PaymentMethod[] = ["cash", "card", "bank"];
const METHOD_NAMES: Record<PaymentMethod, string> = { cash: "cash", card: "card", bank: "bank transfer" };

async function parsePayment(formData: FormData) {
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be more than 0");

  const method = String(formData.get("method") ?? "") as PaymentMethod;
  if (!METHODS.includes(method)) throw new Error("Pick how it was paid");

  const paid_on = String(formData.get("paid_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) throw new Error("Pick the payment date");

  const received_by = String(formData.get("received_by") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  // the rate comes from the clinic's settings, never from the form — and only for card
  let surcharge_rate: number | null = null;
  if (method === "card" && formData.get("surcharge") === "on") {
    const supabase = await createClient();
    surcharge_rate = (await getClinicConfig(supabase)).cardSurchargeRate;
  }

  return { amount, method, paid_on, received_by, note, surcharge_rate };
}

function describe(p: { amount: number; method: PaymentMethod; surcharge_rate: number | null }) {
  const surcharge = p.surcharge_rate ? ` + ${(p.surcharge_rate * 100).toFixed(1).replace(/\.0$/, "")}% card surcharge` : "";
  return `£${p.amount} ${METHOD_NAMES[p.method]}${surcharge}`;
}

function revalidate(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  revalidatePath("/team");
}

/** "Paid" per visit means paid at least what's expected for it (treatment + extras). */
function isFullyPaid(p: Patient): boolean {
  const owed = (key: string, expected: number | null) =>
    (expected ?? 0) + p.extras.filter((e) => (e.extra_visit_id ?? `visit${e.visit_number}`) === key).reduce((s, e) => s + e.total, 0);
  const visit1 = (p.visit1_actual ?? 0) >= owed("visit1", p.visit1_expected) && p.visit1_actual != null;
  const visit2 = !p.needs_visit2 || ((p.visit2_actual ?? 0) >= owed("visit2", p.visit2_expected) && p.visit2_actual != null);
  return visit1 && visit2;
}

export async function addPayment(
  patientId: string,
  visitKey: string,
  formData: FormData
): Promise<{ celebration: Celebration | null }> {
  const supabase = await createClient();
  const user = await requirePermission("payments.record");

  const input = await parsePayment(formData);
  const before = await getPatient(supabase, patientId);
  if (!before) throw new Error("Patient not found");

  const { error } = await supabase.from("patient_payments").insert({ ...input, ...visitRef(visitKey), patient_id: patientId });
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "payment_added",
    "patient",
    patientId,
    `${visitLabel(visitKey, before.extra_visits)}: ${describe(input)}`
  );
  revalidate(patientId);

  // Celebrations only for whoever earns the commission — anyone else recording the payment
  // (operations, accounting) just gets a plain confirmation.
  const after = await getPatient(supabase, patientId);
  if (!after || user.id !== after.responsible_seller_id) return { celebration: null };

  const visitDate =
    visitKey === "visit1" ? after.visit1_date : visitKey === "visit2" ? after.visit2_date : after.extra_visits.find((v) => v.id === visitKey)?.visit_date ?? null;
  if (visitDate) {
    const [settings, allPatients] = await Promise.all([getSettings(supabase, after.responsible_seller_id), getPatients(supabase)]);
    const jump = detectTierJump(allPatients, after.responsible_seller_id, settings, visitDate, input.amount);
    if (jump) return { celebration: jump };
  }
  if (!isFullyPaid(before) && isFullyPaid(after)) {
    return { celebration: { kind: "confetti", message: `🏁 ${after.name} is fully paid off — treatment complete!` } };
  }
  return { celebration: { kind: "confetti", message: `💰 Payment received for ${after.name}!` } };
}

export async function updatePayment(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("payments.record");

  const input = await parsePayment(formData);
  const { data: existing } = await supabase.from("patient_payments").select("method, surcharge_rate").eq("id", id).maybeSingle();
  // editing a card payment that already had a surcharge keeps its original rate — a later
  // change to the clinic's rate mustn't rewrite what the patient actually paid
  if (input.surcharge_rate != null && existing?.method === "card" && existing.surcharge_rate != null) {
    input.surcharge_rate = Number(existing.surcharge_rate);
  }

  const { data, error } = await supabase.from("patient_payments").update(input).eq("id", id).select("patient_id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "payment_updated", "patient", data.patient_id, describe(input));
  revalidate(data.patient_id);
}

export async function deletePayment(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("payments.record");

  const { data, error } = await supabase
    .from("patient_payments")
    .delete()
    .eq("id", id)
    .select("patient_id, amount, method, surcharge_rate")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "payment_deleted",
    "patient",
    data.patient_id,
    describe({ amount: Number(data.amount), method: data.method, surcharge_rate: data.surcharge_rate != null ? Number(data.surcharge_rate) : null })
  );
  revalidate(data.patient_id);
}
