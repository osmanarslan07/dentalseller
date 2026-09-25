"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSellers } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { findSellerByName, sellerLabel } from "@/lib/sellers";
import { requirePermission } from "@/lib/permissions";

/** Sellers without an account — people who get credit for sales but never log in; a
 * coordinator enters their patients. All admin-only: RLS allows these writes to a clinic
 * admin only, and only on records without an account (an account's record follows its
 * profile). */

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a name");
  if (name.length > 80) throw new Error("That name is too long");
  return name;
}

function friendly(message: string): string {
  if (/row-level security/i.test(message)) return "Only an admin can change the seller list";
  if (/foreign key/i.test(message)) return "This seller still has patients — merge them into another seller instead";
  return message;
}

function refresh() {
  revalidatePath("/users", "layout");
  revalidatePath("/sales-performance");
  revalidatePath("/patients");
  revalidatePath("/");
}

export async function addSellerRecord(rawName: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");
  const name = cleanName(rawName);

  const existing = findSellerByName(await getSellers(supabase), name);
  if (existing) throw new Error(`“${sellerLabel(existing)}” is already on the seller list`);

  const { data, error } = await supabase.from("sellers").insert({ name }).select("id").single();
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, "seller_record_added", "seller", data.id, name);
  refresh();
}

export async function renameSellerRecord(id: string, rawName: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");
  const name = cleanName(rawName);

  const sellers = await getSellers(supabase);
  const current = sellers.find((s) => s.id === id);
  if (!current) throw new Error("Seller not found");
  const clash = findSellerByName(sellers, name);
  if (clash && clash.id !== id) throw new Error(`“${sellerLabel(clash)}” is already on the list — merge instead`);

  const { error } = await supabase.from("sellers").update({ name }).eq("id", id).is("profile_id", null);
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, "seller_record_renamed", "seller", id, `${sellerLabel(current)} → ${name}`);
  refresh();
}

/** An inactive seller keeps their patients and history but is no longer offered in pickers. */
export async function setSellerRecordActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");

  const { error } = await supabase.from("sellers").update({ is_active: active }).eq("id", id).is("profile_id", null);
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, active ? "seller_record_activated" : "seller_record_deactivated", "seller", id);
  refresh();
}

/** Only possible while nothing is credited to them — the database refuses otherwise. */
export async function deleteSellerRecord(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");

  const current = (await getSellers(supabase)).find((s) => s.id === id);
  if (!current || current.profile_id) throw new Error("Seller not found");

  const { error } = await supabase.from("sellers").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, "seller_record_deleted", "seller", null, sellerLabel(current));
  refresh();
}

/** Moves everything credited to a seller without an account — patients, commission already
 * earned — to another seller, then removes them. Fixes a duplicate, and links someone to the
 * account they've since been given. */
export async function mergeSellerRecord(fromId: string, intoId: string): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");

  const sellers = await getSellers(supabase);
  const from = sellers.find((s) => s.id === fromId);
  const into = sellers.find((s) => s.id === intoId);
  if (!from || !into) throw new Error("Seller not found");

  const { error } = await supabase.rpc("merge_sellers", { from_id: fromId, into_id: intoId });
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, "seller_record_merged", "seller", intoId, `${sellerLabel(from)} into ${sellerLabel(into)}`);
  refresh();
}

/** Commission rates of a seller without an account (accounts set their own in Settings). */
export async function saveSellerCommission(id: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const user = await requirePermission("sellers.manage");

  const n = (k: string) => Number(formData.get(k));
  const tier1_threshold = n("tier1_threshold");
  const tier2_threshold = n("tier2_threshold");
  const tier1_rate = n("tier1_rate") / 100;
  const tier2_rate = n("tier2_rate") / 100;
  const tier3_rate = n("tier3_rate") / 100;
  const fixed_monthly_payment = n("fixed_monthly_payment");

  if (![tier1_threshold, tier2_threshold].every((v) => Number.isFinite(v) && v >= 0)) {
    throw new Error("Thresholds must be positive numbers");
  }
  if (tier2_threshold <= tier1_threshold) throw new Error("Tier 2 threshold must be greater than tier 1 threshold");
  if (![tier1_rate, tier2_rate, tier3_rate].every((v) => Number.isFinite(v) && v >= 0 && v < 1)) {
    throw new Error("Rates must be between 0 and 100%");
  }
  if (!Number.isFinite(fixed_monthly_payment) || fixed_monthly_payment < 0) {
    throw new Error("Fixed monthly payment must be a positive number");
  }

  const { error } = await supabase.from("settings").upsert({
    user_id: id,
    tier1_threshold,
    tier1_rate,
    tier2_threshold,
    tier2_rate,
    tier3_rate,
    fixed_monthly_payment,
  });
  if (error) throw new Error(friendly(error.message));

  await logActivity(supabase, user.actorId, "seller_commission_updated", "seller", id);
  revalidatePath("/users", "layout");
  revalidatePath("/sales-performance");
}
