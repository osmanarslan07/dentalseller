"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EARNINGS_CARD_IDS, OPERATIONAL_CARD_IDS } from "@/lib/dashboard-cards";
import { getClinicConfig, getSettings } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { assertViewerCanWrite, getActingUser } from "@/lib/viewer";
import { requirePermission } from "@/lib/permissions";

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("earnings.own");

  const tier1_threshold = Number(formData.get("tier1_threshold"));
  const tier1_rate = Number(formData.get("tier1_rate")) / 100;
  const tier2_threshold = Number(formData.get("tier2_threshold"));
  const tier2_rate = Number(formData.get("tier2_rate")) / 100;
  const tier3_rate = Number(formData.get("tier3_rate")) / 100;
  const fixed_monthly_payment = Number(formData.get("fixed_monthly_payment"));
  const show_try = formData.get("show_try") === "on";
  const currency = String(formData.get("currency") ?? "GBP");

  if (!Number.isFinite(tier1_threshold) || tier1_threshold < 0 || !Number.isFinite(tier2_threshold) || tier2_threshold < 0) {
    throw new Error("Thresholds must be positive numbers");
  }
  if (tier2_threshold <= tier1_threshold) {
    throw new Error("Tier 2 threshold must be greater than tier 1 threshold");
  }
  if (!Number.isFinite(tier1_rate) || !Number.isFinite(tier2_rate) || !Number.isFinite(tier3_rate)) {
    throw new Error("Rates must be numbers");
  }
  if (!Number.isFinite(fixed_monthly_payment) || fixed_monthly_payment < 0) {
    throw new Error("Fixed monthly payment must be a positive number");
  }

  const before = await getSettings(supabase, user.id);

  const { error } = await supabase.from("settings").upsert({
    user_id: user.id,
    tier1_threshold,
    tier1_rate,
    tier2_threshold,
    tier2_rate,
    tier3_rate,
    fixed_monthly_payment,
    show_try,
    currency,
  });

  if (error) throw new Error(error.message);

  const changes: string[] = [];
  if (before.tier1_threshold !== tier1_threshold) changes.push(`tier1 threshold ${before.tier1_threshold} → ${tier1_threshold}`);
  if (before.tier1_rate !== tier1_rate) changes.push(`tier1 rate ${before.tier1_rate} → ${tier1_rate}`);
  if (before.tier2_threshold !== tier2_threshold) changes.push(`tier2 threshold ${before.tier2_threshold} → ${tier2_threshold}`);
  if (before.tier2_rate !== tier2_rate) changes.push(`tier2 rate ${before.tier2_rate} → ${tier2_rate}`);
  if (before.tier3_rate !== tier3_rate) changes.push(`tier3 rate ${before.tier3_rate} → ${tier3_rate}`);
  if (before.fixed_monthly_payment !== fixed_monthly_payment) {
    changes.push(`fixed monthly payment ${before.fixed_monthly_payment} → ${fixed_monthly_payment}`);
  }
  if (before.show_try !== show_try) changes.push(`show TRY ${before.show_try} → ${show_try}`);
  if (before.currency !== currency) changes.push(`currency ${before.currency} → ${currency}`);
  if (changes.length > 0) {
    await logActivity(supabase, user.actorId, "commission_settings_updated", "settings", user.id, changes.join(", "));
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/patients");
  revalidatePath("/earnings");
}

/** settings.clinic — enforced both here and by the clinic_config RLS policy + guard trigger. Clinic-
 * wide (see saveTelegramGroupChat above): every seller's confirmation letters and quote
 * offers use this one shared identity, not whatever their own `settings` row had. */
export async function saveClinicBranding(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("settings.clinic");

  const myProfile = { clinic_id: user.viewer.clinicId };
  // the logo upload below uses the service role, which the DB's read-only rule can't see
  assertViewerCanWrite(user.viewer);

  const clinic_name = String(formData.get("clinic_name") ?? "").trim();
  const clinic_short_name = String(formData.get("clinic_short_name") ?? "").trim();
  const clinic_address = String(formData.get("clinic_address") ?? "").trim();
  const clinic_phone = String(formData.get("clinic_phone") ?? "").trim();
  const clinic_email = String(formData.get("clinic_email") ?? "").trim();

  if (!clinic_name || !clinic_short_name) {
    throw new Error("Clinic name is required");
  }

  const logoFile = formData.get("clinic_logo") as File | null;
  let clinic_logo_url: string | undefined;

  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      throw new Error("Logo must be under 2MB");
    }
    const admin = createAdminClient();
    const ext = logoFile.name.split(".").pop() || "png";
    // one folder per clinic — a shared path would let one clinic's upload replace another's logo
    const path = `clinic/${myProfile.clinic_id}/logo.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("clinic-assets")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrl } = admin.storage.from("clinic-assets").getPublicUrl(path);
    clinic_logo_url = `${publicUrl.publicUrl}?v=${Date.now()}`;
  }

  const before = await getClinicConfig(supabase);

  const { error } = await supabase.from("clinic_config").upsert({
    clinic_id: myProfile.clinic_id,
    clinic_name,
    clinic_short_name,
    clinic_address,
    clinic_phone,
    clinic_email,
    ...(clinic_logo_url ? { clinic_logo_url } : {}),
  });

  if (error) throw new Error(error.message);

  const changes: string[] = [];
  if (before.clinicName !== clinic_name) changes.push(`name ${before.clinicName} → ${clinic_name}`);
  if (before.clinicShortName !== clinic_short_name) changes.push(`short name ${before.clinicShortName} → ${clinic_short_name}`);
  if (before.clinicAddress !== clinic_address) changes.push("address changed");
  if (before.clinicPhone !== clinic_phone) changes.push("phone changed");
  if (before.clinicEmail !== clinic_email) changes.push("email changed");
  if (clinic_logo_url) changes.push("logo changed");
  if (changes.length > 0) {
    await logActivity(supabase, user.actorId, "clinic_branding_updated", "settings", user.id, changes.join(", "));
  }

  revalidatePath("/settings");
  revalidatePath("/patients/[id]/confirmation-letter", "page");
  revalidatePath("/quotes/[id]/offer", "page");
}

/** settings.clinic — enforced both here and by the clinic_config RLS policy + guard trigger. Clinic-
 * wide, unlike the commission/dashboard-cards settings below, so it lives in its own
 * singleton table rather than a per-seller `settings` row. */
export async function saveTelegramGroupChat(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("settings.clinic");

  const myProfile = { clinic_id: user.viewer.clinicId };

  const raw = String(formData.get("telegram_group_chat_id") ?? "").trim();
  const telegram_group_chat_id = raw || null;

  const before = await getClinicConfig(supabase);

  const { error } = await supabase
    .from("clinic_config")
    .upsert({ clinic_id: myProfile.clinic_id, telegram_group_chat_id });
  if (error) throw new Error(error.message);

  if (before.telegramGroupChatId !== telegram_group_chat_id) {
    await logActivity(
      supabase,
      user.actorId,
      "telegram_group_chat_updated",
      "settings",
      user.id,
      telegram_group_chat_id ? `set to ${telegram_group_chat_id}` : "cleared"
    );
  }

  revalidatePath("/settings");
}

/** settings.clinic — enforced both here and by the clinic_config RLS policy + guard trigger.
 * Clinic-wide rules for how money is counted: whether hotel/transfer costs come off before
 * commission, and the optional card surcharge rate. */
export async function saveSystemSettings(formData: FormData) {
  const supabase = await createClient();
  const user = await requirePermission("settings.clinic");

  const myProfile = { clinic_id: user.viewer.clinicId };

  const deduct_costs_from_commission = formData.get("deduct_costs_from_commission") === "on";
  const card_surcharge_rate = Number(formData.get("card_surcharge_rate")) / 100;
  if (!Number.isFinite(card_surcharge_rate) || card_surcharge_rate < 0 || card_surcharge_rate > 1) {
    throw new Error("Card surcharge must be between 0 and 100%");
  }

  const before = await getClinicConfig(supabase);

  const { error } = await supabase
    .from("clinic_config")
    .upsert({ clinic_id: myProfile.clinic_id, deduct_costs_from_commission, card_surcharge_rate });
  if (error) throw new Error(error.message);

  const changes: string[] = [];
  if (before.deductCostsFromCommission !== deduct_costs_from_commission) {
    changes.push(`deduct costs from commission ${before.deductCostsFromCommission} → ${deduct_costs_from_commission}`);
  }
  if (before.cardSurchargeRate !== card_surcharge_rate) {
    changes.push(`card surcharge ${before.cardSurchargeRate} → ${card_surcharge_rate}`);
  }
  if (changes.length > 0) {
    await logActivity(supabase, user.actorId, "system_settings_updated", "settings", user.id, changes.join(", "));
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/patients");
  revalidatePath("/earnings");
}

/** One saved column (`settings.dashboard_cards`) backs both pickers — Dashboard and Earnings
 * each only ever submit their own category's ids, so saving one must splice those in without
 * touching the other category's stored order. */
export async function saveDashboardCards(formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const category = formData.get("category");
  const categoryIds = category === "earnings" ? EARNINGS_CARD_IDS : OPERATIONAL_CARD_IDS;
  const validCardIds = new Set<string>(categoryIds);
  const submittedIds = formData
    .getAll("dashboard_cards")
    .filter((id): id is string => typeof id === "string" && validCardIds.has(id));

  const current = await getSettings(supabase, user.id);
  const otherCategoryIds = current.dashboard_cards.filter((id) => !validCardIds.has(id));
  const dashboard_cards = category === "earnings" ? [...otherCategoryIds, ...submittedIds] : [...submittedIds, ...otherCategoryIds];

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, dashboard_cards });

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/earnings");
  await logActivity(supabase, user.actorId, "dashboard_cards_updated", "settings", user.id, dashboard_cards.join(", "));

  revalidatePath("/settings");
  revalidatePath("/");
}
