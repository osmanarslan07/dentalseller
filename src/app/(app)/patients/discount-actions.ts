"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "@/lib/data";
import { plainAmount } from "@/lib/money";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { visitDiscountSetting } from "@/lib/commission";
import { DiscountType } from "@/types";

function describe(type: DiscountType, value: number, reason: string | null, currency: string): string {
  return `${type === "percent" ? `${value}%` : plainAmount(value, currency)}${reason ? ` (${reason})` : ""}`;
}

/** Sets or (no value) removes the discount on one visit — "visit1" | "visit2" | an extra
 * visit's id. Anyone who can change money may give one, with no cap: it comes off the visit's
 * price + extras (never below zero, see visitDiscount) and is always logged. */
export async function setVisitDiscount(patientId: string, visitKey: string, formData: FormData): Promise<void> {
  // the discount lives on the patient / visit row, which also needs patients.edit (RLS)
  const user = await requirePermission("money.edit");
  const supabase = await createClient();

  const rawValue = String(formData.get("discount_value") ?? "").trim();
  const type = formData.get("discount_type") === "percent" ? "percent" : "amount";
  const reason = String(formData.get("discount_reason") ?? "").trim().slice(0, 200) || null;
  let value: number | null = null;
  if (rawValue) {
    value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error("The discount must be 0 or more");
    if (type === "percent" && value > 100) throw new Error("A percentage discount can't be more than 100%");
    value = Math.round(value * 100) / 100;
    if (value === 0) value = null;
  }

  const patient = await getPatient(supabase, patientId);
  if (!patient) throw new Error("Patient not found");
  const before = visitDiscountSetting(patient, visitKey);

  const fields = value == null ? { type: null, value: null, reason: null } : { type, value, reason };
  let error;
  if (visitKey === "visit1" || visitKey === "visit2") {
    ({ error } = await supabase
      .from("patients")
      .update({
        [`${visitKey}_discount_type`]: fields.type,
        [`${visitKey}_discount_value`]: fields.value,
        [`${visitKey}_discount_reason`]: fields.reason,
      })
      .eq("id", patientId)
      .select("id")
      .single());
  } else {
    if (!patient.extra_visits.some((v) => v.id === visitKey)) throw new Error("Visit not found");
    ({ error } = await supabase
      .from("patient_visits")
      .update({ discount_type: fields.type, discount_value: fields.value, discount_reason: fields.reason })
      .eq("id", visitKey)
      .select("id")
      .single());
  }
  if (error) throw new Error(/0 rows|multiple \(or no\) rows/i.test(error.message) ? "You don't have permission to change this patient" : error.message);

  const label = visitKey === "visit1" ? "Visit 1" : visitKey === "visit2" ? "Visit 2" : patient.extra_visits.find((v) => v.id === visitKey)?.label ?? "visit";
  const detail =
    value == null
      ? `${label}: removed${before ? ` ${describe(before.type, before.value, before.reason, patient.currency)}` : ""}`
      : `${label}: ${before ? `${describe(before.type, before.value, before.reason, patient.currency)} → ` : ""}${describe(type, value, reason, patient.currency)}`;
  await logActivity(supabase, user.actorId, value == null ? "discount_removed" : "discount_set", "patient", patientId, detail);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  revalidatePath("/accounting");
}
