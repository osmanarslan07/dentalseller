import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Telegram webhook — verified via the secret token header (set when the webhook was
 * registered with Telegram), not a user session. Only handles `/start <code>` to link a
 * seller's chat; anything else is ignored. */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await request.json();
  const message = update.message;
  const text: string | undefined = message?.text;
  const chatId: number | undefined = message?.chat?.id;

  if (!text || chatId == null) {
    return NextResponse.json({ ok: true });
  }

  const match = text.match(/^\/start\s+([a-f0-9]+)/i);
  if (!match) {
    return NextResponse.json({ ok: true });
  }

  const code = match[1];
  const admin = createAdminClient();

  const { data: linkCode } = await admin
    .from("telegram_link_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!linkCode) {
    await sendTelegramMessage(String(chatId), "This code isn't valid. Generate a new one from Settings.");
    return NextResponse.json({ ok: true });
  }

  if (linkCode.used_at || new Date(linkCode.expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(String(chatId), "This code has expired. Generate a new one from Settings.");
    return NextResponse.json({ ok: true });
  }

  await admin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);
  await admin.from("profiles").update({ telegram_chat_id: String(chatId) }).eq("id", linkCode.user_id);

  await sendTelegramMessage(String(chatId), "✅ Telegram connected — you'll get your notifications here from now on.");

  return NextResponse.json({ ok: true });
}
