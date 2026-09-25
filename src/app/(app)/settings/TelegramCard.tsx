"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { generateTelegramLinkCode, TelegramLinkInfo } from "@/lib/telegram-actions";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

export function TelegramCard({ connected }: { connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<TelegramLinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const info = await generateTelegramLinkCode();
        setLink(info);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Failed to generate code"));
      }
    });
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Telegram notifications")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {connected
          ? t("Connected — new patients and visit/task reminders go to your own Telegram chat.")
          : t("Not connected — you won't get personal Telegram notifications until you connect.")}
      </p>

      <Button onClick={handleGenerate} disabled={pending} variant={connected ? "secondary" : "primary"}>
        {pending ? t("Generating…") : connected ? t("Reconnect Telegram") : t("Connect Telegram")}
      </Button>

      {link && (
        <div className="mt-4 rounded-lg bg-teal-50 p-4 text-sm text-teal-800">
          <p>
            {rich(t("Open {link} on your phone, or send {code} to {bot} on Telegram — within {n} minutes."), {
              link: (
                <a href={link.deepLink} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  {t("this link")}
                </a>
              ),
              code: <code className="rounded bg-white px-1.5 py-0.5 font-mono">/start {link.code}</code>,
              bot: <span className="font-medium">@{link.botUsername}</span>,
              n: link.expiresInMinutes,
            })}
          </p>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
