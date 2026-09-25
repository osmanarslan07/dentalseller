"use server";

import { st } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { encryptSecret, loadApiSettings, newVerifyToken, recordApiError, sendTemplate } from "@/lib/whatsapp";
import { cleanParam } from "@/lib/whatsapp-templates";
import { DriverMessagesMode } from "@/types";

const MODE_NAMES: Record<DriverMessagesMode, string> = { app: "WhatsApp app", api: "WhatsApp Business API", off: "off" };

async function requireAdmin() {
  const supabase = await createClient();
  const user = await requirePermission("messaging.manage");
  return { supabase, user, clinicId: user.viewer.clinicId };
}

function revalidate() {
  revalidatePath("/settings", "layout");
  revalidatePath("/patients", "layout");
  revalidatePath("/transfers");
}

/** WhatsApp app / off switch straight away. The API needs a successful test message first
 * (saveWhatsAppApi), so switching back to it is only allowed once that has happened. */
export async function setDriverMessagesMode(mode: DriverMessagesMode) {
  if (!(mode in MODE_NAMES)) throw new Error(await st("Unknown option"));
  const { supabase, user, clinicId } = await requireAdmin();

  if (mode === "api") {
    const { data } = await supabase.from("clinic_config").select("whatsapp_verified_at").eq("clinic_id", clinicId).maybeSingle();
    const settings = await loadApiSettings(clinicId);
    if (!data?.whatsapp_verified_at || "error" in settings) throw new Error(await st("Fill in the API details and send a test message first"));
  }

  const { error } = await supabase.from("clinic_config").update({ driver_messages_mode: mode }).eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  await logActivity(supabase, user.actorId, "driver_messages_updated", "settings", user.id, MODE_NAMES[mode]);
  revalidate();
}

const IDS = /^\d{5,30}$/;
const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
const LANG = /^[a-z]{2,3}(_[A-Z]{2})?$/;

export type ApiSaveResult = { ok: true } | { ok: false; error: string };

/** Saves the API details, then sends the single-transfer template to a test number. Only a
 * message that actually goes through switches the clinic to API sending. The token and app
 * secret are optional when already saved — an empty field keeps the stored one. */
export async function saveWhatsAppApi(formData: FormData): Promise<ApiSaveResult> {
  const { supabase, user, clinicId } = await requireAdmin();
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  const phoneNumberId = str("phone_number_id");
  const businessAccountId = str("business_account_id");
  const templateSingle = str("template_single");
  const templateDay = str("template_day");
  const templateLang = str("template_lang") || "tr";
  const accessToken = str("access_token");
  const appSecret = str("app_secret");
  const testPhone = str("test_phone");

  if (!IDS.test(phoneNumberId)) return { ok: false, error: "The phone number ID is a long number from WhatsApp Manager / the Meta app (not the phone number itself)" };
  if (businessAccountId && !IDS.test(businessAccountId)) return { ok: false, error: "The WhatsApp Business Account ID should be a long number" };
  if (!TEMPLATE_NAME.test(templateSingle) || !TEMPLATE_NAME.test(templateDay)) {
    return { ok: false, error: "Template names use lowercase letters, numbers and _ only, exactly as in WhatsApp Manager" };
  }
  if (!LANG.test(templateLang)) return { ok: false, error: "Language code like tr or en_US" };
  if (!testPhone) return { ok: false, error: "Enter a phone number to send the test message to" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("clinic_whatsapp_secrets")
    .select("access_token_enc, app_secret_enc, webhook_verify_token")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!accessToken && !existing?.access_token_enc) return { ok: false, error: "Paste the access token" };

  const { error: cfgError } = await supabase
    .from("clinic_config")
    .update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_business_account_id: businessAccountId || null,
      whatsapp_template_single: templateSingle,
      whatsapp_template_day: templateDay,
      whatsapp_template_lang: templateLang,
    })
    .eq("clinic_id", clinicId);
  if (cfgError) return { ok: false, error: cfgError.message };

  const { error: secretError } = await admin.from("clinic_whatsapp_secrets").upsert({
    clinic_id: clinicId,
    access_token_enc: accessToken ? encryptSecret(accessToken) : existing!.access_token_enc,
    app_secret_enc: appSecret ? encryptSecret(appSecret) : existing?.app_secret_enc ?? null,
    webhook_verify_token: existing?.webhook_verify_token ?? newVerifyToken(),
    updated_at: new Date().toISOString(),
  });
  if (secretError) return { ok: false, error: secretError.message };

  const settings = await loadApiSettings(clinicId);
  if ("error" in settings) return { ok: false, error: settings.error };
  const result = await sendTemplate(
    settings,
    testPhone,
    settings.templateSingle,
    ["TEST", "Havalimanı", "Otel", "Test (1 kişi)", "-", "-", "DentalSeller bağlantı testi"].map(cleanParam)
  );

  if (!result.ok) {
    await supabase.from("clinic_config").update({ whatsapp_verified_at: null }).eq("clinic_id", clinicId);
    await recordApiError(clinicId, `Test message failed: ${result.error}`);
    await logActivity(supabase, user.actorId, "driver_messages_updated", "settings", user.id, "WhatsApp API test failed");
    revalidate();
    return { ok: false, error: result.error };
  }

  await supabase
    .from("clinic_config")
    .update({ driver_messages_mode: "api", whatsapp_verified_at: new Date().toISOString() })
    .eq("clinic_id", clinicId);
  await recordApiError(clinicId, null);
  await logActivity(supabase, user.actorId, "driver_messages_updated", "settings", user.id, "WhatsApp Business API (test message sent)");
  revalidate();
  return { ok: true };
}
