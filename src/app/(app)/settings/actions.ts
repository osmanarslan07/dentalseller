"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DASHBOARD_CARDS } from "@/lib/dashboard-cards";
import { getClinicConfig, getSettings } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

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
    await logActivity(supabase, user.id, "commission_settings_updated", "settings", user.id, changes.join(", "));
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/patients");
  revalidatePath("/projections");
}

/** Admin-only — enforced both here and by the clinic_config_update_admin RLS policy. Clinic-
 * wide (see saveTelegramGroupChat above): every seller's confirmation letters and quote
 * offers use this one shared identity, not whatever their own `settings` row had. */
export async function saveClinicBranding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (myProfile?.role !== "admin") throw new Error("Admin only");

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
    const path = `clinic/logo.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("clinic-assets")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrl } = admin.storage.from("clinic-assets").getPublicUrl(path);
    clinic_logo_url = `${publicUrl.publicUrl}?v=${Date.now()}`;
  }

  const before = await getClinicConfig(supabase);

  const { error } = await supabase.from("clinic_config").upsert({
    id: true,
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
    await logActivity(supabase, user.id, "clinic_branding_updated", "settings", user.id, changes.join(", "));
  }

  revalidatePath("/settings");
  revalidatePath("/patients/[id]/confirmation-letter", "page");
  revalidatePath("/quotes/[id]/offer", "page");
}

/** Admin-only — enforced both here and by the clinic_config_update_admin RLS policy. Clinic-
 * wide, unlike the commission/dashboard-cards settings below, so it lives in its own
 * singleton table rather than a per-seller `settings` row. */
export async function saveTelegramGroupChat(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (myProfile?.role !== "admin") throw new Error("Admin only");

  const raw = String(formData.get("telegram_group_chat_id") ?? "").trim();
  const telegram_group_chat_id = raw || null;

  const before = await getClinicConfig(supabase);

  const { error } = await supabase
    .from("clinic_config")
    .upsert({ id: true, telegram_group_chat_id });
  if (error) throw new Error(error.message);

  if (before.telegramGroupChatId !== telegram_group_chat_id) {
    await logActivity(
      supabase,
      user.id,
      "telegram_group_chat_updated",
      "settings",
      user.id,
      telegram_group_chat_id ? `set to ${telegram_group_chat_id}` : "cleared"
    );
  }

  revalidatePath("/settings");
}

export async function saveDashboardCards(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const validCardIds = new Set<string>(DASHBOARD_CARDS.map((c) => c.id));
  const dashboard_cards = formData
    .getAll("dashboard_cards")
    .filter((id): id is string => typeof id === "string" && validCardIds.has(id));

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, dashboard_cards });

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "dashboard_cards_updated", "settings", user.id, dashboard_cards.join(", "));

  revalidatePath("/settings");
  revalidatePath("/");
}
