"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatient, getPatients, getSettings } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { detectTierJump } from "@/lib/commission";
import { visitLabel, visitRef } from "@/lib/visit-key";
import { Celebration, ClinicConfig, Patient, PaymentMethod } from "@/types";
import { can, requirePermission } from "@/lib/permissions";
import { clinicCurrencyList, dealToMain, plainAmount } from "@/lib/money";
import { RateSource, clinicRate } from "@/lib/rates";

const METHODS: PaymentMethod[] = ["cash", "card", "bank"];
const METHOD_NAMES: Record<PaymentMethod, string> = { cash: "cash", card: "card", bank: "bank transfer" };

type ExistingRates = { currency: string; paid_on: string; rate_to_deal: number; rate_to_main: number; rate_source: RateSource | null };

/** The rates a payment is converted at: 1 unit of what was handed over → the patient's deal
 * currency (for "still due") and → the clinic's main currency (for reports), on the day it came
 * in. Someone with money.edit can type them in instead ("manual"). An edit that keeps the
 * currency and date keeps the rates it was recorded with. */
async function paymentRates(
  formData: FormData,
  patient: Patient,
  config: ClinicConfig,
  currency: string,
  paidOn: string,
  mayCorrect: boolean,
  existing?: ExistingRates | null
): Promise<{ rate_to_deal: number; rate_to_main: number; rate_source: RateSource | null }> {
  const deal = patient.currency;
  const main = config.mainCurrency;
  const typed = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error("An exchange rate must be a number above 0");
    return n;
  };
  const manualDeal = currency === deal ? null : typed("rate_to_deal");
  const manualMain = currency === main || deal === main ? null : typed("rate_to_main");
  if ((manualDeal != null || manualMain != null) && !mayCorrect) throw new Error("You don't have permission to set an exchange rate");

  const kept = existing && existing.currency === currency && existing.paid_on === paidOn ? existing : null;
  let toDeal: { rate: number; source: RateSource | null } | null = { rate: 1, source: null };
  if (currency !== deal) {
    toDeal =
      manualDeal != null
        ? { rate: manualDeal, source: "manual" }
        : kept
        ? { rate: kept.rate_to_deal, source: kept.rate_source }
        : await clinicRate(config, currency, deal, paidOn);
  }
  let toMain: { rate: number; source: RateSource | null } | null = { rate: 1, source: null };
  if (currency !== main) {
    toMain =
      deal === main
        ? toDeal
        : manualMain != null
        ? { rate: manualMain, source: "manual" }
        : kept
        ? { rate: kept.rate_to_main, source: kept.rate_source }
        : await clinicRate(config, currency, main, paidOn);
  }
  if (!toDeal || !toMain) throw new Error(`No exchange rate for ${currency} on that date yet — try again, or enter the rate`);
  const sources = [toDeal.source, toMain.source];
  const rate_source: RateSource | null = sources.includes("manual")
    ? "manual"
    : sources.includes("clinic")
    ? "clinic"
    : sources.includes("auto")
    ? "auto"
    : null;
  return { rate_to_deal: toDeal.rate, rate_to_main: toMain.rate, rate_source };
}

async function parsePayment(formData: FormData, patient: Patient, mayCorrect: boolean, existing?: ExistingRates | null) {
  const paid_amount = Number(formData.get("amount"));
  if (!Number.isFinite(paid_amount) || paid_amount <= 0) throw new Error("Amount must be more than 0");

  const method = String(formData.get("method") ?? "") as PaymentMethod;
  if (!METHODS.includes(method)) throw new Error("Pick how it was paid");

  const paid_on = String(formData.get("paid_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) throw new Error("Pick the payment date");

  const received_by = String(formData.get("received_by") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const config = await getClinicConfig(supabase);
  // any of the clinic's currencies (or the patient's own, should the clinic have dropped it)
  const currency = String(formData.get("currency") || patient.currency);
  if (currency !== patient.currency && !clinicCurrencyList({ main: config.mainCurrency, deal: config.dealCurrencies }).includes(currency)) {
    throw new Error(`The clinic doesn't take payments in ${currency}`);
  }
  const rates = await paymentRates(formData, patient, config, currency, paid_on, mayCorrect, existing);

  // the surcharge rate comes from the clinic's settings, never from the form — and only for card
  let surcharge_rate: number | null = null;
  if (method === "card" && formData.get("surcharge") === "on") surcharge_rate = config.cardSurchargeRate;

  // `amount` (in the deal currency) is worked out again by the database from paid_amount × rate
  const amount = Math.round(paid_amount * rates.rate_to_deal * 100) / 100;
  return { amount, paid_amount, currency, ...rates, method, paid_on, received_by, note, surcharge_rate };
}

/** "£300 cash", "€200 (= £171.4) card + 3% card surcharge" — for the history. */
function describe(
  p: { amount: number; paid_amount?: number; currency?: string; method: PaymentMethod; surcharge_rate: number | null },
  dealCurrency: string
) {
  const surcharge = p.surcharge_rate ? ` + ${(p.surcharge_rate * 100).toFixed(1).replace(/\.0$/, "")}% card surcharge` : "";
  const paidIn = p.currency ?? dealCurrency;
  const handed = plainAmount(p.paid_amount ?? p.amount, paidIn);
  const counts = paidIn !== dealCurrency ? ` (= ${plainAmount(p.amount, dealCurrency)})` : "";
  return `${handed}${counts} ${METHOD_NAMES[p.method]}${surcharge}`;
}

function revalidate(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/earnings");
  revalidatePath("/sales-performance");
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

  const before = await getPatient(supabase, patientId);
  if (!before) throw new Error("Patient not found");
  const input = await parsePayment(formData, before, can(user.viewer, "money.edit"));

  const { error } = await supabase.from("patient_payments").insert({ ...input, ...visitRef(visitKey), patient_id: patientId });
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "payment_added",
    "patient",
    patientId,
    `${visitLabel(visitKey, before.extra_visits)}: ${describe(input, before.currency)}`
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
    // tiers are in the main currency, at the rate the price was agreed at
    const jump = detectTierJump(allPatients, after.responsible_seller_id, settings, visitDate, dealToMain(after, input.amount));
    if (jump) return { celebration: jump };
  }
  if (!isFullyPaid(before) && isFullyPaid(after)) {
    return { celebration: { kind: "confetti", message: `🏁 ${after.name} is fully paid off — treatment complete!` } };
  }
  return { celebration: { kind: "confetti", message: `💰 Payment received for ${after.name}!` } };
}

export async function updatePayment(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("payments.edit");

  const { data: existing } = await supabase
    .from("patient_payments")
    .select("patient_id, method, surcharge_rate, currency, paid_on, rate_to_deal, rate_to_main, rate_source")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Payment not found");
  const patient = await getPatient(supabase, existing.patient_id);
  if (!patient) throw new Error("Patient not found");
  const input = await parsePayment(formData, patient, can(user.viewer, "money.edit"), {
    currency: existing.currency,
    paid_on: existing.paid_on,
    rate_to_deal: Number(existing.rate_to_deal),
    rate_to_main: Number(existing.rate_to_main),
    rate_source: existing.rate_source,
  });
  // editing a card payment that already had a surcharge keeps its original rate — a later
  // change to the clinic's rate mustn't rewrite what the patient actually paid
  if (input.surcharge_rate != null && existing?.method === "card" && existing.surcharge_rate != null) {
    input.surcharge_rate = Number(existing.surcharge_rate);
  }

  const { data, error } = await supabase.from("patient_payments").update(input).eq("id", id).select("patient_id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "payment_updated", "patient", data.patient_id, describe(input, patient.currency));
  revalidate(data.patient_id);
}

export async function deletePayment(id: string) {
  const supabase = await createClient();
  const user = await requirePermission("payments.edit");

  const { data, error } = await supabase
    .from("patient_payments")
    .delete()
    .eq("id", id)
    .select("patient_id, amount, paid_amount, currency, method, surcharge_rate, patients(currency)")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(
    supabase,
    user.actorId,
    "payment_deleted",
    "patient",
    data.patient_id,
    describe(
      {
        amount: Number(data.amount),
        paid_amount: Number(data.paid_amount),
        currency: data.currency,
        method: data.method,
        surcharge_rate: data.surcharge_rate != null ? Number(data.surcharge_rate) : null,
      },
      (data.patients as unknown as { currency: string } | null)?.currency ?? data.currency
    )
  );
  revalidate(data.patient_id);
}
