"use server";

import { st } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";

function refresh() {
  revalidatePath("/", "layout");
}

/** Clinic settings → Money → Currencies: the main currency (only while the clinic has no
 * patients — the database refuses it after that), the other currencies it deals in, and for
 * each of those either the market rate or the clinic's own fixed rate. */
export async function saveCurrencySettings(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("settings.money");
  const before = await getClinicConfig(supabase);

  const main = String(formData.get("main_currency") ?? before.mainCurrency);
  if (!isSupportedCurrency(main)) throw new Error(await st("Pick a main currency"));

  const deal = SUPPORTED_CURRENCIES.filter((c) => c !== main && formData.get(`deal_${c}`) === "on");

  const fixed: Record<string, number> = {};
  for (const c of deal) {
    if (formData.get(`source_${c}`) !== "clinic") continue;
    const rate = Number(formData.get(`rate_${c}`));
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(await st("Enter the clinic's own rate for {currency}, or use the market rate", { currency: c }));
    fixed[c] = rate;
  }

  const { error } = await supabase.from("clinic_config").upsert({
    clinic_id: user.viewer.clinicId,
    main_currency: main,
    deal_currencies: deal,
    fixed_rates: fixed,
  });
  if (error) throw new Error(error.message);

  const changes: string[] = [];
  if (before.mainCurrency !== main) changes.push(`main currency ${before.mainCurrency} → ${main}`);
  const was = before.dealCurrencies.join(", ") || "none";
  const now = deal.join(", ") || "none";
  if (was !== now) changes.push(`other currencies ${was} → ${now}`);
  for (const c of new Set([...Object.keys(before.fixedRates), ...Object.keys(fixed)])) {
    const a = before.fixedRates[c];
    const b = fixed[c];
    if (a !== b) changes.push(`${c} rate ${a ? `own ${a}` : "market"} → ${b ? `own ${b}` : "market"}`);
  }
  if (changes.length > 0) {
    await logActivity(supabase, user.actorId, "system_settings_updated", "settings", user.id, changes.join(", "));
  }
  refresh();
}

/** The currency a seller usually agrees prices in; null = the main currency. */
export async function saveSellerCurrency(sellerId: string, currency: string | null) {
  const supabase = await createClient();
  const user = await requirePermission(["settings.money", "sellers.manage"]);
  const { error } = await supabase.rpc("set_seller_currency", { p_seller: sellerId, p_currency: currency });
  if (error) throw new Error(error.message);
  await logActivity(supabase, user.actorId, "seller_currency_updated", "seller", sellerId, currency ?? "main currency");
  refresh();
}
