import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { waDigits } from "@/lib/transfer-message";

/** Server-only: the clinic's WhatsApp Business (Cloud API) credentials and sending. Never
 * import this from a client component — it reads the service-role client and the secrets. */

/** Meta's Graph API version. Versions stay supported for about two years; bump when Meta
 * announces this one's end of life. */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

// ---------- encryption at rest ----------

/** AES-256-GCM, key from WHATSAPP_SECRET_KEY (or, when that isn't set, the service-role key —
 * rotating it then means re-entering the token in Settings). A database dump alone never
 * reveals a clinic's token. */
function key(): Buffer {
  const material = process.env.WHATSAPP_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) throw new Error("Server is missing its encryption key");
  return createHash("sha256").update(`whatsapp:${material}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function newVerifyToken(): string {
  return randomBytes(18).toString("base64url");
}

// ---------- clinic settings ----------

export interface WhatsAppApiSettings {
  clinicId: string;
  phoneNumberId: string;
  templateSingle: string;
  templateDay: string;
  templateLang: string;
  accessToken: string;
}

/** Everything needed to send for one clinic, or a reason it can't. */
export async function loadApiSettings(clinicId: string): Promise<WhatsAppApiSettings | { error: string }> {
  const admin = createAdminClient();
  const [{ data: config }, { data: secrets }] = await Promise.all([
    admin
      .from("clinic_config")
      .select("whatsapp_phone_number_id, whatsapp_template_single, whatsapp_template_day, whatsapp_template_lang")
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    admin.from("clinic_whatsapp_secrets").select("access_token_enc").eq("clinic_id", clinicId).maybeSingle(),
  ]);
  if (!config?.whatsapp_phone_number_id) return { error: "WhatsApp API isn't set up — add the phone number ID in Settings → Transfers" };
  if (!secrets?.access_token_enc) return { error: "WhatsApp API isn't set up — add the access token in Settings → Transfers" };
  let accessToken: string;
  try {
    accessToken = decryptSecret(secrets.access_token_enc);
  } catch {
    return { error: "The saved access token can't be read any more — enter it again in Settings → Transfers" };
  }
  return {
    clinicId,
    phoneNumberId: config.whatsapp_phone_number_id,
    templateSingle: config.whatsapp_template_single,
    templateDay: config.whatsapp_template_day,
    templateLang: config.whatsapp_template_lang,
    accessToken,
  };
}

/** For the admin's settings card: what's saved (never the secrets themselves), and the
 * webhook verify token to paste into the Meta app. */
export async function getSecretsStatus(clinicId: string): Promise<{ hasToken: boolean; hasAppSecret: boolean; verifyToken: string | null }> {
  const { data } = await createAdminClient()
    .from("clinic_whatsapp_secrets")
    .select("access_token_enc, app_secret_enc, webhook_verify_token")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return { hasToken: !!data?.access_token_enc, hasAppSecret: !!data?.app_secret_enc, verifyToken: data?.webhook_verify_token ?? null };
}

/** Shown in Settings so an admin sees the API is failing without waiting for someone to complain. */
export async function recordApiError(clinicId: string, error: string | null) {
  try {
    await createAdminClient()
      .from("clinic_config")
      .update({ whatsapp_last_error: error, whatsapp_last_error_at: error ? new Date().toISOString() : null })
      .eq("clinic_id", clinicId);
  } catch (e) {
    console.error("Recording the WhatsApp error failed:", e);
  }
}

// ---------- sending ----------

/** Meta's error codes, in words a clinic admin can act on. */
function explain(code: number | undefined, message: string, details?: string): string {
  switch (code) {
    case 190:
      return "The access token is invalid or expired — create a new one and save it in Settings → Transfers";
    case 10:
    case 200:
      return "The access token doesn't have permission to send from this number (needs whatsapp_business_messaging)";
    case 131026:
    case 133010:
      return "This number can't receive WhatsApp messages — check the driver's phone number";
    case 132000:
      return "The message doesn't match the template's variables — check the template text in WhatsApp Manager";
    case 132001:
      return "Template not found — check its name and language, and that Meta has approved it";
    case 132015:
    case 132016:
      return "Meta paused or disabled this template — check WhatsApp Manager";
    case 131042:
      return "There's a payment problem on the WhatsApp Business account";
    case 131056:
    case 130429:
    case 80007:
      return "Too many messages too quickly — wait a minute and try again";
    case 100:
      return `Meta rejected the request: ${details || message}`;
    default:
      return details ? `${message} — ${details}` : message;
  }
}

/** Sends one approved template with body parameters. Returns Meta's message id. */
export async function sendTemplate(
  s: WhatsAppApiSettings,
  to: string,
  template: string,
  params: string[]
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const digits = waDigits(to);
  if (digits.length < 8) return { ok: false, error: "No valid phone number (use the international format, e.g. +90 555 123 45 67)" };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(s.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "template",
        template: {
          name: template,
          language: { code: s.templateLang },
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
        },
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { messages?: { id: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } }
      | null;
    const id = json?.messages?.[0]?.id;
    if (res.ok && id) return { ok: true, messageId: id };
    const err = json?.error;
    return { ok: false, error: explain(err?.code, err?.message ?? `WhatsApp API error (${res.status})`, err?.error_data?.details) };
  } catch (e) {
    return { ok: false, error: `Couldn't reach WhatsApp: ${e instanceof Error ? e.message : "network error"}` };
  }
}

// ---------- webhook ----------

/** Meta signs each webhook POST with the app secret: X-Hub-Signature-256 = sha256=HMAC(body). */
export function validSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
