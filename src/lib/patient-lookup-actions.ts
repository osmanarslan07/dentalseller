"use server";

import { createClient } from "@/lib/supabase/server";
import { PatientOption, searchPatientNames } from "@/lib/data";
import { requirePermission } from "@/lib/permissions";
import { Patient } from "@/types";

/** Type-to-search for patient pickers (tasks, activity filter). Which patients come back is
 * still RLS's call: someone who can't see patients gets none. */
export async function searchPatients(query: string): Promise<PatientOption[]> {
  await requirePermission(["patients.view", "tasks.use", "activity.view"], { forRead: true });
  return searchPatientNames(await createClient(), query);
}

export type NamedPatient = Pick<Patient, "id" | "name" | "confirmation_date" | "responsible_seller_id">;

/** Patients already carrying this exact name (trimmed, any case), to warn before adding a
 * duplicate. The database narrows by a contains-match; the exact rule is applied here. */
export async function findPatientsNamed(name: string): Promise<NamedPatient[]> {
  await requirePermission("patients.edit", { forRead: true });
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  const supabase = await createClient();
  const matches = await searchPatientNames(supabase, name.trim(), 200);
  const ids = matches.filter((p) => p.name.trim().toLowerCase() === wanted).map((p) => p.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, confirmation_date, responsible_seller_id")
    .in("id", ids)
    .order("confirmation_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NamedPatient[];
}
