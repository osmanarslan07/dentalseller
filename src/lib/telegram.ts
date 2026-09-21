/** Low-level send to one specific chat. Every caller must resolve the right chat id itself —
 * there is no more single global chat. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram not configured");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) throw new Error(`Telegram send failed: ${await res.text()}`);
}

/** Best-effort fan-out — logs failures per chat instead of letting one bad chat id
 * (e.g. the seller blocked the bot) stop everyone else's notification. */
export async function sendTelegramMessageToMany(chatIds: string[], text: string): Promise<void> {
  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        await sendTelegramMessage(chatId, text);
      } catch (err) {
        console.error(`Telegram send to ${chatId} failed:`, err);
      }
    })
  );
}

/** Clinic-wide fallback chat (the original single chat this app used before per-seller
 * linking existed) — still notified alongside a seller's own chat, and used alone when a
 * seller hasn't linked Telegram yet so nothing gets silently dropped. */
export function getFallbackChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID ?? null;
}

/** Shared group chat for arrival/departure reminders only — tasks stay seller-private since
 * a task list is personal to-dos, not something the whole team needs pinged about. */
export function getGroupChatId(): string | null {
  return process.env.TELEGRAM_GROUP_CHAT_ID ?? null;
}

let cachedBotUsername: string | null = null;

/** Used to build the t.me deep link for the "Connect Telegram" flow. */
export async function getBotUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram not configured");

  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok) throw new Error(`Telegram getMe failed: ${await res.text()}`);

  const data = await res.json();
  cachedBotUsername = data.result.username as string;
  return cachedBotUsername;
}
