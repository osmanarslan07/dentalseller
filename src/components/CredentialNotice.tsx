"use client";

import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/i18n/client";

/** One-time temp-password handoff, shared by the Users page and the platform area. */
export function CredentialNotice({ title, email, tempPassword }: { title: string; email: string; tempPassword: string }) {
  const { showToast } = useToast();
  const t = useT();

  return (
    <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-medium">
        {title} {email}
      </p>
      <p className="mt-1">
        {t("Temporary password:")} <code className="rounded bg-white px-1.5 py-0.5 font-mono">{tempPassword}</code>
      </p>
      <p className="mt-2 text-xs text-emerald-700">
        {t("Share this with them directly, not by email — this password is shown once and isn't saved anywhere.")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => navigator.clipboard.writeText(tempPassword).then(() => showToast(t("Password copied")))}
      >
        {t("Copy password")}
      </Button>
    </div>
  );
}
