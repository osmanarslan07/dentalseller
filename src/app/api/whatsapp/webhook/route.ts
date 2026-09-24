import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, recordApiError, validSignature } from "@/lib/whatsapp";
import { WhatsAppStatus } from "@/types";

export const dynamic = "force-dynamic";

/** Meta calls this once when the webhook is registered in the Meta app (Webhooks → WhatsApp
 * Business Account): it must echo hub.challenge if hub.verify_token is one a clinic got from
 * Settings → Transfers. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = p.get("hub.verify_token");
  if (p.get("hub.mode") !== "subscribe" || !token) return new NextResponse("Forbidden", { status: 403 });

  const { data } = await createAdminClient()
    .from("clinic_whatsapp_secrets")
    .select("clinic_id")
    .eq("webhook_verify_token", token)
    .maybeSingle();
  if (!data) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

type StatusUpdate = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};
type Change = { value?: { metadata?: { phone_number_id?: string }; statuses?: StatusUpdate[] } };
type Payload = { entry?: { changes?: Change[] }[] };

/** Later states never go back: a late "delivered" mustn't overwrite "read". */
const RANK: Record<WhatsAppStatus, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Delivery updates for messages sent to drivers. Signed by Meta with the Meta app's secret
 * (X-Hub-Signature-256); the clinic is found from the sending phone number ID. Driver
 * replies arrive here too and are ignored — they belong in a WhatsApp inbox, not here. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const changes = (payload.entry ?? []).flatMap((e) => e.changes ?? []);
  const phoneNumberId = changes.find((c) => c.value?.metadata?.phone_number_id)?.value?.metadata?.phone_number_id;
  if (!phoneNumberId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: clinics } = await admin.from("clinic_config").select("clinic_id").eq("whatsapp_phone_number_id", phoneNumberId);
  const clinicId = clinics?.length === 1 ? (clinics[0].clinic_id as string) : null;
  if (!clinicId) return NextResponse.json({ ok: true });

  const { data: secrets } = await admin.from("clinic_whatsapp_secrets").select("app_secret_enc").eq("clinic_id", clinicId).maybeSingle();
  let appSecret: string | null = null;
  try {
    appSecret = secrets?.app_secret_enc ? decryptSecret(secrets.app_secret_enc) : null;
  } catch {
    appSecret = null;
  }
  if (!appSecret || !validSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statuses = changes
    .filter((c) => c.value?.metadata?.phone_number_id === phoneNumberId)
    .flatMap((c) => c.value?.statuses ?? []);

  for (const s of statuses) {
    if (!s.id || !(s.status in RANK)) continue;
    const { data: rows } = await admin
      .from("transfers")
      .select("id, wa_status")
      .eq("clinic_id", clinicId)
      .eq("wa_message_id", s.id);
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
    const e = s.errors?.[0];
    const error = s.status === "failed" ? [e?.title || e?.message || "Not delivered", e?.error_data?.details].filter(Boolean).join(" — ") : null;

    for (const row of rows ?? []) {
      const current = row.wa_status as WhatsAppStatus | null;
      if (current && s.status !== "failed" && RANK[current] >= RANK[s.status]) continue;
      await admin.from("transfers").update({ wa_status: s.status, wa_status_at: at, wa_error: error }).eq("id", row.id);
    }
    if (error && rows?.length) await recordApiError(clinicId, `Message to a driver failed: ${error}`);
  }

  return NextResponse.json({ ok: true });
}
