"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { saveTelegramGroupChat } from "./actions";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

export function TelegramGroupCard({ groupChatId }: { groupChatId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const t = useT();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveTelegramGroupChat(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Something went wrong"));
      }
    });
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Team Telegram group")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {t("Arrival and departure reminders (transfer/hotel warnings included) are also sent here, on top of each seller's own chat. Task reminders stay private to whoever owns the task.")}
      </p>

      <form action={handleSubmit} className="space-y-3">
        <div>
          <Label>{t("Group chat ID")}</Label>
          <Input
            name="telegram_group_chat_id"
            placeholder={t("e.g. -1001234567890")}
            defaultValue={groupChatId ?? ""}
          />
          <p className="mt-1 text-xs text-slate-400">
            {rich(t("Add the bot to your Telegram group, send any message there, then open {url} and copy the group's {field} (a negative number). Leave blank to stop sending to a group."), {
              url: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>,
              field: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">chat.id</code>,
            })}
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t("Settings saved.")}</p>}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("Saving…") : t("Save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
