"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig } from "@/lib/data";
import { logActivity } from "@/lib/activity-log";
import { loadApiSettings, recordApiError, sendTemplate } from "@/lib/whatsapp";
import { dayParams, singleParams, TransferForMessage } from "@/lib/whatsapp-templates";
import { Transfer } from "@/types";
import { requirePermission } from "@/lib/permissions";
import { st } from "@/i18n/server";

type Row = Transfer & {
  clinic_id: string;
  patient: { name: string; phone: string | null } | null;
  driver: { name: string; phone: string | null } | null;
};

export type SendResult = { ok: true; messages: number } | { ok: false; error: string };

/** Sends transfer details to the driver from the clinic's WhatsApp Business number: one
 * transfer as the single-transfer template, several (one driver, one day) as the day list.
 * The message is built here from the database — never from text the browser sends.
 * Doesn't throw on a WhatsApp failure: it returns the reason so the page can offer to open
 * WhatsApp on the device instead. */
export async function sendTransfersWhatsApp(transferIds: string[]): Promise<SendResult> {
  if (transferIds.length === 0) return { ok: false, error: "Nothing to send" };
  const supabase = await createClient();
  const user = await requirePermission("transfers.manage");

  const config = await getClinicConfig(supabase);
  if (config.driverMessages.mode !== "api") return { ok: false, error: "WhatsApp API sending is turned off in Settings → Transfers" };

  const { data, error } = await supabase
    .from("transfers")
    .select("*, patient:patients(name, phone), driver:drivers(name, phone)")
    .in("id", transferIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length !== transferIds.length) return { ok: false, error: "Some of these transfers no longer exist — refresh the page" };

  const driver = rows[0].driver;
  if (!driver || rows.some((r) => r.driver_id !== rows[0].driver_id)) return { ok: false, error: "Pick a driver for the transfer first" };
  if (!driver.phone) return { ok: false, error: await st("{name} has no phone number — add it in Settings → Transfers", { name: driver.name }) };
  const date = rows[0].transfer_date;
  if (rows.length > 1 && (!date || rows.some((r) => r.transfer_date !== date))) {
    return { ok: false, error: "A day list can only hold one day's transfers" };
  }

  const clinicId = rows[0].clinic_id;
  const settings = await loadApiSettings(clinicId);
  if ("error" in settings) return { ok: false, error: settings.error };

  rows.sort((a, b) => (a.transfer_time ?? "99").localeCompare(b.transfer_time ?? "99"));
  const items: TransferForMessage[] = rows.map((r) => ({ transfer: r, patientName: r.patient?.name ?? "?", patientPhone: r.patient?.phone ?? null }));
  const messages =
    rows.length === 1
      ? [{ template: settings.templateSingle, params: singleParams(items[0]), rows }]
      : dayParams(date!, items).map((m) => ({ template: settings.templateDay, params: m.params, rows: m.items.map((i) => rows[i]) }));

  const now = new Date().toISOString();
  let sent = 0;
  for (const m of messages) {
    const result = await sendTemplate(settings, driver.phone, m.template, m.params);
    const ids = m.rows.map((r) => r.id);
    if (!result.ok) {
      await supabase.from("transfers").update({ wa_status: "failed", wa_status_at: now, wa_error: result.error }).in("id", ids);
      await recordApiError(clinicId, result.error);
      revalidate();
      return { ok: false, error: sent > 0 ? `${sent} of ${messages.length} messages sent, then: ${result.error}` : result.error };
    }
    sent++;
    for (const r of m.rows) {
      await supabase
        .from("transfers")
        .update({
          status: r.status === "done" ? "done" : "sent",
          sent_at: now,
          wa_message_id: result.messageId,
          wa_status: "accepted",
          wa_status_at: now,
          wa_error: null,
        })
        .eq("id", r.id);
      const route = `${r.from_place ?? "?"} → ${r.to_place ?? "?"}`;
      const when = r.transfer_date ? ` ${r.transfer_date.split("-").reverse().join(".")}${r.transfer_time ? ` ${r.transfer_time}` : ""}` : "";
      await logActivity(supabase, user.actorId, "transfer_sent", "patient", r.patient_id, `${route}${when} → ${driver.name} (WhatsApp API)`);
    }
  }

  if (config.driverMessages.lastError) await recordApiError(clinicId, null);
  revalidate();
  return { ok: true, messages: sent };
}

function revalidate() {
  revalidatePath("/patients", "layout");
  revalidatePath("/transfers");
  revalidatePath("/settings", "layout");
}
