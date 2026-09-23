"use client";

import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";

/** One-time temp-password handoff, same wording as the clinic-level TeamCard. */
export function CredentialNotice({ title, email, tempPassword }: { title: string; email: string; tempPassword: string }) {
  const { showToast } = useToast();

  return (
    <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-medium">
        {title} {email}
      </p>
      <p className="mt-1">
        Temporary password: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{tempPassword}</code>
      </p>
      <p className="mt-2 text-xs text-emerald-700">
        Share this with them directly, not by email — this password is shown once and isn&apos;t saved anywhere.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => navigator.clipboard.writeText(tempPassword).then(() => showToast("Password copied"))}
      >
        Copy password
      </Button>
    </div>
  );
}
