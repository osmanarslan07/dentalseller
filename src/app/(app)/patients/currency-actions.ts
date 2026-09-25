"use server";

import { st } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatient } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { clinicCurrencyList, rateLabel, RATE_SOURCE_LABELS } from "@/lib/money";
import { RateSource, clinicRate } from "@/lib/rates";
import { dealCurrencyFields } from "@/lib/deal-currency";
import { clinicTodayIso } from "@/lib/balance";

/** What a payment in `currency` on `date` would be converted at — shown in the payment form
 * before saving. Same rules as recording it (the clinic's own rate, else the market rate). */
export async function previewPaymentRates(
  dealCurrency: string,
  currency: string,
  date: string
): Promise<{ toDeal: number | null; toMain: number | null; source: RateSource | null }> {
  await requirePermission(["payments.record", "payments.edit"], { forRead: true });
  const supabase = await createClient();
  const config = await getClinicConfig(supabase);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : clinicTodayIso();
  const [toDeal, toMain] = await Promise.all([
    clinicRate(config, currency, dealCurrency, day),
    clinicRate(config, currency, config.mainCurrency, day),
  ]);
  const sources = [toDeal?.source, toMain?.source];
  return {
    toDeal: toDeal?.rate ?? null,
    toMain: toMain?.rate ?? null,
    source: sources.includes("clinic") ? "clinic" : sources.includes("auto") ? "auto" : null,
  };
}

/** Change a patient's deal currency (only before the first payment — the database refuses it
 * after), or correct the rate the price was agreed at. money.edit. A new currency takes the
 * rate on the confirmation date (today if that's still ahead); `rate` sets it by hand. */
export async function setDealCurrency(patientId: string, currency: string, rate: number | null) {
  const supabase = await createClient();
  const user = await requirePermission("money.edit");
  const [patient, config] = await Promise.all([getPatient(supabase, patientId), getClinicConfig(supabase)]);
  if (!patient) throw new Error(await st("Patient not found"));

  let fields;
  if (rate != null) {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(await st("The rate must be a number above 0"));
    if (currency !== patient.currency && !clinicCurrencyList({ main: config.mainCurrency, deal: config.dealCurrencies }).includes(currency)) {
      throw new Error(`The clinic doesn't deal in ${currency}`);
    }
    fields = { currency, deal_rate: rate, deal_rate_on: patient.deal_rate_on ?? clinicTodayIso(), deal_rate_source: "manual" as const };
  } else {
    fields = await dealCurrencyFields(config, currency, patient.confirmation_date);
  }

  const { error } = await supabase.from("patients").update(fields).eq("id", patientId);
  if (error) throw new Error(error.message);

  const detail =
    fields.currency === config.mainCurrency
      ? `${fields.currency} (main currency)`
      : `${fields.currency} at ${rateLabel(fields.currency, config.mainCurrency, fields.deal_rate)}${
          fields.deal_rate_source ? ` (${RATE_SOURCE_LABELS[fields.deal_rate_source]})` : ""
        }`;
  await logActivity(supabase, user.actorId, "deal_currency_updated", "patient", patientId, detail);

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  revalidatePath("/sales-performance");
  revalidatePath("/accounting");
}
