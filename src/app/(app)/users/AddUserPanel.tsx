"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { CredentialNotice } from "@/components/CredentialNotice";
import { useToast } from "@/components/Toast";
import { MemberRole } from "@/types";
import type { ClinicRole } from "@/lib/roles";
import { RoleChips } from "./RoleChips";
import { AddSellerResult, addSeller } from "./actions";
import { useT } from "@/i18n/client";

/** "Add user": opens a small form under the page header; the temporary password is shown
 * once, here, for the admin to pass on. */
export function AddUserPanel({ roles }: { roles: ClinicRole[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [newRoles, setNewRoles] = useState<MemberRole[]>(["sales"]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AddSellerResult | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const t = useT();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    startTransition(async () => {
      try {
        setCreated(await addSeller(email, newRoles));
        setEmail("");
        setNewRoles(["sales"]);
        showToast(t("User added ✓"));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Failed to add the user"));
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("Add user")}
      </Button>
    );
  }

  return (
    <Card className="w-full p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>{t("Email of the new user")}</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("Close")}
            </Button>
            <Button type="submit" disabled={pending || newRoles.length === 0}>
              {pending ? t("Adding…") : t("Add")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{t("Roles:")}</span>
          <RoleChips
            roles={newRoles}
            options={roles}
            disabled={pending}
            onToggle={(role) => setNewRoles((rs) => (rs.includes(role) ? rs.filter((x) => x !== role) : [...rs, role]))}
          />
        </div>
        <p className="text-xs text-slate-500">
          {t("They get a temporary password to sign in with and choose their name on first sign-in.")}
        </p>
      </form>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {created && (
        <div className="mt-4">
          <CredentialNotice title={t("Account created for")} email={created.email} tempPassword={created.tempPassword} />
        </div>
      )}
    </Card>
  );
}
