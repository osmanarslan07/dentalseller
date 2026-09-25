"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { DriverMessagesConfig, DriverMessagesMode } from "@/types";
import { TEMPLATE_DAY_BODY, TEMPLATE_DAY_EXAMPLE, TEMPLATE_SINGLE_BODY, TEMPLATE_SINGLE_EXAMPLE } from "@/lib/whatsapp-templates";
import { saveWhatsAppApi, setDriverMessagesMode } from "./driver-messages-actions";
import { useLocale, useT } from "@/i18n/client";
import { msg } from "@/i18n";
import { rich } from "@/i18n/rich";

export interface WhatsAppSecretsStatus {
  hasToken: boolean;
  hasAppSecret: boolean;
  verifyToken: string | null;
}

const OPTIONS: { mode: DriverMessagesMode; title: string; body: string }[] = [
  {
    mode: "app",
    title: msg("WhatsApp app"),
    body: msg("Clicking WhatsApp opens WhatsApp on this computer or phone with the message filled in — you press send. No setup."),
  },
  {
    mode: "api",
    title: msg("WhatsApp Business API"),
    body: msg("Sent straight from the clinic’s WhatsApp Business number, with delivered / read status on each transfer. Needs the clinic’s Meta details."),
  },
  {
    mode: "off",
    title: msg("Off"),
    body: msg("No WhatsApp buttons. “Copy message” still gives you the text to paste anywhere."),
  },
];

function useWhen() {
  const locale = useLocale();
  return (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function useCopy() {
  const { showToast } = useToast();
  const t = useT();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("{what} copied", { what: t(what) }));
    } catch {
      showToast(t("Couldn't copy — your browser blocked the clipboard"), "error");
    }
  };
}

/** Settings → Transfers → how transfer details reach drivers. */
export function DriverMessagesCard({
  config,
  isAdmin,
  secrets,
  webhookUrl,
}: {
  config: DriverMessagesConfig;
  isAdmin: boolean;
  secrets: WhatsAppSecretsStatus | null;
  webhookUrl: string;
}) {
  const router = useRouter();
  const t = useT();
  const when = useWhen();
  const { showToast } = useToast();
  const [choice, setChoice] = useState<DriverMessagesMode>(config.mode);
  const [pending, startTransition] = useTransition();

  function switchTo(mode: DriverMessagesMode) {
    startTransition(async () => {
      try {
        await setDriverMessagesMode(mode);
        showToast(
          mode === "off"
            ? t("Driver messages turned off")
            : mode === "api"
              ? t("Driver messages now use the WhatsApp Business API ✓")
              : t("Driver messages now use the WhatsApp app ✓")
        );
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Something went wrong"), "error");
      }
    });
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Driver messages")}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {t("How transfer details reach drivers from a patient’s transfers and the Transfers page. Messages are in Turkish.")}
        {!isAdmin && ` ${t("Only an admin can change this.")}`}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="radiogroup" aria-label={t("Driver messages")}>
        {OPTIONS.map((o) => {
          const selected = choice === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!isAdmin}
              onClick={() => setChoice(o.mode)}
              className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition disabled:cursor-default ${
                selected ? "border-teal-600 bg-teal-50/60" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${selected ? "border-teal-600" : "border-slate-300"}`}>
                  {selected && <span className="h-2 w-2 rounded-full bg-teal-600" />}
                </span>
                {t(o.title)}
                {config.mode === o.mode && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t("In use")}</span>}
              </span>
              <span className="text-xs leading-relaxed text-slate-500">{t(o.body)}</span>
            </button>
          );
        })}
      </div>

      {config.mode === "api" && config.lastError && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {t("Last WhatsApp API problem")}{config.lastErrorAt ? ` (${when(config.lastErrorAt)})` : ""}: {config.lastError}
        </p>
      )}

      {isAdmin && choice !== "api" && choice !== config.mode && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => switchTo(choice)} disabled={pending}>
            {pending ? t("Saving…") : choice === "off" ? t("Turn driver messages off") : t("Use the WhatsApp app")}
          </Button>
        </div>
      )}

      {choice === "api" && (
        <ApiSetup config={config} isAdmin={isAdmin} secrets={secrets} webhookUrl={webhookUrl} onReuse={() => switchTo("api")} reusePending={pending} />
      )}
    </Card>
  );
}

function ApiSetup({
  config,
  isAdmin,
  secrets,
  webhookUrl,
  onReuse,
  reusePending,
}: {
  config: DriverMessagesConfig;
  isAdmin: boolean;
  secrets: WhatsAppSecretsStatus | null;
  webhookUrl: string;
  onReuse: () => void;
  reusePending: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const when = useWhen();
  const { showToast } = useToast();
  const copy = useCopy();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const connected = config.mode === "api" && !!config.verifiedAt;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await saveWhatsAppApi(fd);
        if (result.ok) {
          showToast(t("Test message sent — WhatsApp Business API is on ✓"));
          router.refresh();
        } else {
          setError(result.error);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  if (!isAdmin) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        {connected
          ? t("Connected — last checked {when}.", { when: when(config.verifiedAt!) })
          : t("Not set up yet. An admin fills in the clinic’s WhatsApp Business details here.")}
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
      {connected ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          ✓ {t("Connected — test message went through {when}. Change anything below and send a new test to update it.", { when: when(config.verifiedAt!) })}
        </p>
      ) : config.verifiedAt && config.mode !== "api" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span>{t("These details worked on {when}.", { when: when(config.verifiedAt) })}</span>
          <Button size="sm" onClick={onReuse} disabled={reusePending}>
            {reusePending ? t("Switching…") : t("Use the API again")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {t("Fill in the clinic’s details from Meta, then send a test message. The API is switched on only once the test message arrives — until then, drivers keep getting messages the current way.")}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone number ID" hint="WhatsApp Manager → Phone numbers, or the Meta app → WhatsApp → API setup. A long number — not the phone number itself.">
            <Input name="phone_number_id" defaultValue={config.phoneNumberId ?? ""} inputMode="numeric" required autoComplete="off" />
          </Field>
          <Field label="WhatsApp Business Account ID" hint="Optional — useful for support. Also in WhatsApp Manager.">
            <Input name="business_account_id" defaultValue={config.businessAccountId ?? ""} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Access token" hint="A permanent token from a System User with whatsapp_business_messaging. Stored encrypted; never shown again.">
            <Input
              name="access_token"
              type="password"
              autoComplete="off"
              placeholder={secrets?.hasToken ? t("Saved — leave empty to keep it") : "EAAG…"}
              required={!secrets?.hasToken}
            />
          </Field>
          <Field label="App secret" hint="Meta app → App settings → Basic. Needed for delivered / read status. Stored encrypted.">
            <Input name="app_secret" type="password" autoComplete="off" placeholder={secrets?.hasAppSecret ? t("Saved — leave empty to keep it") : t("Optional for sending")} />
          </Field>
          <Field label="Template: one transfer" hint="Name exactly as approved in WhatsApp Manager.">
            <Input name="template_single" defaultValue={config.templateSingle} required autoComplete="off" />
          </Field>
          <Field label="Template: driver’s day list">
            <Input name="template_day" defaultValue={config.templateDay} required autoComplete="off" />
          </Field>
          <Field label="Template language" hint="The language the templates were approved in, e.g. tr.">
            <Input name="template_lang" defaultValue={config.templateLang} required autoComplete="off" />
          </Field>
          <Field label="Send the test message to" hint="Your own WhatsApp number, with country code.">
            <Input name="test_phone" type="tel" placeholder="+90 555 123 45 67" required autoComplete="off" />
          </Field>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t("Test message failed: {error}", { error })}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t("Sending test…") : t("Save & send test message")}
          </Button>
        </div>
      </form>

      <Block title="Delivery status (webhook)">
        <p className="text-sm text-slate-600">
          {rich(t("In the Meta app → WhatsApp → Configuration, set the callback URL and verify token below, then subscribe to the {field} field. Without this, sending still works — transfers just won’t show delivered / read."), {
            field: <b>messages</b>,
          })}
        </p>
        <CopyRow label="Callback URL" value={webhookUrl} onCopy={() => copy(webhookUrl, "Callback URL")} />
        {secrets?.verifyToken ? (
          <CopyRow label="Verify token" value={secrets.verifyToken} onCopy={() => copy(secrets.verifyToken!, "Verify token")} />
        ) : (
          <p className="text-xs text-slate-500">{t("The verify token appears here after the first save.")}</p>
        )}
        {webhookUrl.includes("localhost") && (
          <p className="text-xs text-amber-700">{t("This is a local address — Meta can only reach the live site, so set the webhook from the deployed app.")}</p>
        )}
      </Block>

      <Block title="Message templates to submit to Meta">
        <p className="text-sm text-slate-600">
          {rich(t("In WhatsApp Manager → Message templates, create both with category {utility} and language {turkish}. Use the names above and paste the text exactly; Meta asks for example values when you submit."), {
            utility: <b>Utility</b>,
            turkish: <b>Turkish</b>,
          })}
        </p>
        <TemplateBox name={config.templateSingle} body={TEMPLATE_SINGLE_BODY} example={TEMPLATE_SINGLE_EXAMPLE} onCopy={copy} />
        <TemplateBox name={config.templateDay} body={TEMPLATE_DAY_BODY} example={TEMPLATE_DAY_EXAMPLE} onCopy={copy} />
      </Block>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const t = useT();
  return (
    <div>
      <Label>{t(label)}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{t(hint)}</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <details className="group rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
        <span className="mr-1 inline-block transition group-open:rotate-90">›</span> {t(title)}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-slate-500">{t(label)}</span>
      <code className="min-w-0 grow break-all rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800">{value}</code>
      <Button size="sm" variant="secondary" onClick={onCopy}>
        {t("Copy")}
      </Button>
    </div>
  );
}

function TemplateBox({
  name,
  body,
  example,
  onCopy,
}: {
  name: string;
  body: string;
  example: string[];
  onCopy: (text: string, what: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <code className="text-sm font-semibold text-slate-900">{name}</code>
        <Button size="sm" variant="secondary" onClick={() => onCopy(body, "Template text")}>
          {t("Copy text")}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{body}</pre>
      <p className="mt-2 text-xs text-slate-500">
        {t("Examples:")} {example.map((e, i) => `{{${i + 1}}} ${e}`).join(" · ")}
      </p>
    </div>
  );
}
