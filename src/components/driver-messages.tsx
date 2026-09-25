"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { waLink } from "@/lib/transfer-message";
import { sendTransfersWhatsApp } from "@/app/(app)/patients/whatsapp-actions";
import { DriverMessagesMode, Transfer } from "@/types";
import { useT } from "@/i18n/client";

function without(map: Record<string, string>, key: string): Record<string, string> {
  const next = { ...map };
  delete next[key];
  return next;
}

export interface DriverSend {
  /** Identifies the button (a transfer id, or a driver's day) for busy/fallback state. */
  key: string;
  transferIds: string[];
  driverName: string;
  driverPhone: string;
  /** The message as the WhatsApp app gets it — also what "Copy message" copies. */
  text: string;
  /** Records the send after the app was opened (app mode, or the fallback). */
  markSent: () => Promise<void>;
}

/** Sending transfer details to a driver, the way the clinic chose in Settings → Transfers:
 * open WhatsApp on this device ("app"), send from the clinic's number ("api"), or neither
 * ("off" — the buttons are hidden; copying the text still works). When the API fails the
 * page offers to open WhatsApp on the device instead, so nobody is stuck. */
export function useDriverMessages(mode: DriverMessagesMode) {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function recordAppSend(s: DriverSend) {
    startTransition(async () => {
      try {
        await s.markSent();
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Couldn't mark it as sent"), "error");
      }
    });
  }

  function send(s: DriverSend) {
    if (mode === "app") {
      // open straight from the click — browsers block a tab opened after an await
      window.open(waLink(s.driverPhone, s.text), "_blank", "noopener,noreferrer");
      recordAppSend(s);
      return;
    }
    if (mode !== "api") return;
    setBusyKey(s.key);
    startTransition(async () => {
      try {
        const result = await sendTransfersWhatsApp(s.transferIds);
        if (result.ok) {
          setFallback((f) => without(f, s.key));
          showToast(t("Sent to {name} on WhatsApp ✓", { name: s.driverName }));
        } else {
          setFallback((f) => ({ ...f, [s.key]: waLink(s.driverPhone, s.text) }));
          showToast(`WhatsApp API: ${result.error}`, "error");
        }
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Sending failed"), "error");
      } finally {
        setBusyKey(null);
      }
    });
  }

  /** The fallback link was used: the message went out from the device after all. */
  function sentViaFallback(s: DriverSend) {
    setFallback((f) => without(f, s.key));
    recordAppSend(s);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("Message copied — paste it anywhere"));
    } catch {
      showToast(t("Couldn't copy — your browser blocked the clipboard"), "error");
    }
  }

  return { mode, send, copy, busyKey, fallbackUrl: (key: string) => fallback[key] ?? null, sentViaFallback };
}

/** Label for the send button: API sends straight away, the app opens WhatsApp first. */
export function sendLabel(mode: DriverMessagesMode, alreadySent: boolean): string {
  if (mode === "api") return alreadySent ? "Send again" : "Send";
  return alreadySent ? "Resend" : "WhatsApp";
}

/** Shown after an API failure: open WhatsApp on this device with the same message. */
export function FallbackLink({ url, onUse }: { url: string; onUse: () => void }) {
  const t = useT();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onUse}
      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[13px] font-semibold text-amber-800 hover:bg-amber-100"
      title={t("Sending from the clinic's number failed — open WhatsApp on this device with the same message")}
    >
      {t("Open in WhatsApp app")}
    </a>
  );
}

const STATUS_TEXT: Record<NonNullable<Transfer["wa_status"]>, { label: string; className: string }> = {
  accepted: { label: "Sending…", className: "text-slate-500" },
  sent: { label: "✓ Sent", className: "text-slate-500" },
  delivered: { label: "✓✓ Delivered", className: "text-slate-600" },
  read: { label: "✓✓ Read", className: "text-sky-700" },
  failed: { label: "✕ Not delivered", className: "text-red-700" },
};

/** Where the last API message about a transfer got to (API mode only). */
export function WhatsAppDelivery({ transfer }: { transfer: Pick<Transfer, "wa_status" | "wa_error" | "wa_status_at"> }) {
  const t = useT();
  if (!transfer.wa_status) return null;
  const s = STATUS_TEXT[transfer.wa_status];
  return (
    <span className={`text-xs font-medium ${s.className}`} title={transfer.wa_error ?? (transfer.wa_status_at ? new Date(transfer.wa_status_at).toLocaleString("en-GB") : undefined)}>
      {t(s.label)}
      {transfer.wa_status === "failed" && transfer.wa_error ? ` — ${transfer.wa_error}` : ""}
    </span>
  );
}

/** For admins only: driver messages are off, and where to turn them on. */
export function DriverMessagesOffHint() {
  const t = useT();
  return (
    <p className="text-xs text-slate-500">
      {t("Driver messages are off")} ·{" "}
      <Link href="/settings/clinic/messaging" className="font-semibold text-teal-700 hover:text-teal-800">
        {t("Turn on in Settings")}
      </Link>
    </p>
  );
}
