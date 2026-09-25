"use server";

import { st } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";

/** Companies and drivers are the clinic's shared operations list — any active member can add
 * and edit them (RLS enforces clinic + active), only an admin can delete (RLS again).
 * Deactivating is the everyday way to retire one: it keeps past transfers readable. */

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

function revalidate() {
  revalidatePath("/settings", "layout");
  revalidatePath("/patients", "layout");
}

export async function saveTransferCompany(id: string | null, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("transfers.manage");

  const name = str(formData, "name");
  if (!name) throw new Error(await st("Company name is required"));
  const fields = { name, phone: str(formData, "phone"), notes: str(formData, "notes") };

  if (id) {
    const { error } = await supabase.from("transfer_companies").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, user.actorId, "transfer_company_updated", "transfer_company", id, name);
  } else {
    const { data, error } = await supabase
      .from("transfer_companies")
      .insert({ ...fields, is_internal: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, user.actorId, "transfer_company_added", "transfer_company", data.id, name);
  }

  revalidate();
}

export async function setTransferCompanyActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const user = await requirePermission("transfers.manage");

  const { data: company } = await supabase
    .from("transfer_companies")
    .select("name, is_internal")
    .eq("id", id)
    .maybeSingle();
  if (!company) throw new Error(await st("Company not found"));
  if (company.is_internal && !isActive) throw new Error(await st("The clinic's own (internal) transport can't be deactivated"));

  const { error } = await supabase.from("transfer_companies").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "transfer_company_updated",
    "transfer_company",
    id,
    `${company.name} ${isActive ? "reactivated" : "deactivated"}`
  );
  revalidate();
}

export async function deleteTransferCompany(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("drivers.manage");

  const { data: company } = await supabase
    .from("transfer_companies")
    .select("name, is_internal")
    .eq("id", id)
    .maybeSingle();
  if (!company) throw new Error(await st("Company not found"));
  if (company.is_internal) throw new Error(await st("The clinic's own (internal) transport can't be deleted"));

  // RLS lets only an admin delete; a non-admin's delete silently matches no rows
  const { data: deleted, error } = await supabase.from("transfer_companies").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!deleted?.length) throw new Error(await st("Only an admin can delete — deactivate it instead"));

  await logActivity(supabase, user.actorId, "transfer_company_deleted", "transfer_company", id, company.name);
  revalidate();
}

/** drivers.manage (the database lets it write just these clinic_config columns). A driver must
 * work for the chosen company, and both must be this clinic's — checked through RLS-scoped reads. */
export async function saveTransferDefaults(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("drivers.manage");

  const clinicId = user.viewer.clinicId;

  async function pair(kind: "airport" | "local") {
    const companyId = str(formData, `${kind}_company_id`);
    const driverId = companyId ? str(formData, `${kind}_driver_id`) : null;
    if (companyId) {
      const { data } = await supabase.from("transfer_companies").select("id").eq("id", companyId).maybeSingle();
      if (!data) throw new Error(await st("Company not found"));
    }
    if (driverId) {
      const { data } = await supabase.from("drivers").select("company_id").eq("id", driverId).maybeSingle();
      if (!data || data.company_id !== companyId) throw new Error(await st("That driver doesn't work for the chosen company"));
    }
    return { companyId, driverId };
  }
  const airport = await pair("airport");
  const local = await pair("local");

  const { error } = await supabase.from("clinic_config").upsert({
    clinic_id: clinicId,
    default_airport_company_id: airport.companyId,
    default_airport_driver_id: airport.driverId,
    default_local_company_id: local.companyId,
    default_local_driver_id: local.driverId,
  });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "transfer_defaults_updated", "settings", user.id);
  revalidate();
}

export async function saveDriver(id: string | null, companyId: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("transfers.manage");

  const name = str(formData, "name");
  if (!name) throw new Error(await st("Driver name is required"));
  const fields = { name, phone: str(formData, "phone"), vehicle: str(formData, "vehicle") };

  if (id) {
    const { error } = await supabase.from("drivers").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, user.actorId, "driver_updated", "driver", id, name);
  } else {
    const { data, error } = await supabase
      .from("drivers")
      .insert({ ...fields, company_id: companyId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, user.actorId, "driver_added", "driver", data.id, name);
  }

  revalidate();
}

export async function setDriverActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const user = await requirePermission("transfers.manage");

  const { data, error } = await supabase.from("drivers").update({ is_active: isActive }).eq("id", id).select("name").single();
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "driver_updated",
    "driver",
    id,
    `${data.name} ${isActive ? "reactivated" : "deactivated"}`
  );
  revalidate();
}

export async function deleteDriver(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("drivers.manage");

  const { data: driver } = await supabase.from("drivers").select("name").eq("id", id).maybeSingle();
  if (!driver) throw new Error(await st("Driver not found"));

  const { data: deleted, error } = await supabase.from("drivers").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!deleted?.length) throw new Error(await st("Only an admin can delete — deactivate the driver instead"));

  await logActivity(supabase, user.actorId, "driver_deleted", "driver", id, driver.name);
  revalidate();
}
