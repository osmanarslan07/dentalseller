"use server";

import { st } from "@/i18n/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getBotUsername } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";
import { assertNotSupportMode } from "@/lib/viewer";

const CODE_TTL_MINUTES = 10;

export interface TelegramLinkInfo {
  deepLink: string;
  botUsername: string;
  code: string;
  expiresInMinutes: number;
}

/** Generates a one-time code the user sends to the bot as `/start <code>` to link their chat. */
export async function generateTelegramLinkCode(): Promise<TelegramLinkInfo> {
  await assertNotSupportMode();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(await st("Not authenticated"));

  const code = randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase
    .from("telegram_link_codes")
    .insert({ code, user_id: user.id, expires_at: expiresAt });
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "telegram_link_generated", "profile", user.id);

  const botUsername = await getBotUsername();

  return {
    deepLink: `https://t.me/${botUsername}?start=${code}`,
    botUsername,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  };
}
