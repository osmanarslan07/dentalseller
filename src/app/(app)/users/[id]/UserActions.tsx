"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { CredentialNotice } from "@/components/CredentialNotice";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { MemberRole } from "@/types";
import type { ClinicRole } from "@/lib/roles";
import { RoleChips } from "../RoleChips";
import {
  AddSellerResult,
  adminResetPassword,
  deleteSeller,
  setMemberRoles,
  setSellerActive,
  updateMemberProfile,
} from "../actions";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

interface Member {
  id: string;
  displayName: string | null;
  phone: string | null;
  roles: MemberRole[];
  isActive: boolean;
  /** What to call them in messages. */
  name: string;
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Roles, details and the account actions on a user's page. What's offered follows the
 * viewer's permissions; each action checks them again on the server. */
export function UserActions({
  member,
  roles,
  coordinatedCount,
  others,
  isSelf,
  canManage,
  canDelete,
  permissionSummary,
}: {
  member: Member;
  roles: ClinicRole[];
  /** Patients they coordinate; null when the viewer can't see patients. */
  coordinatedCount: number | null;
  /** Active colleagues who could take over their patients. */
  others: { id: string; name: string }[];
  isSelf: boolean;
  canManage: boolean;
  canDelete: boolean;
  permissionSummary: ReactNode;
}) {
  const { showToast } = useToast();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AddSellerResult | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editable = canManage && !isSelf;

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (err) {
        setError(message(err, t("Something went wrong")));
      }
    });
  }

  function toggleRole(role: MemberRole) {
    const next = member.roles.includes(role) ? member.roles.filter((x) => x !== role) : [...member.roles, role];
    if (next.length === 0) {
      setError(t("Everyone needs at least one role — deactivate the account instead."));
      return;
    }
    if (role === "admin" && !confirm(next.includes("admin") ? t("Make {name} an admin?", { name: member.name }) : t("Remove {name} as admin?", { name: member.name }))) return;
    run(async () => {
      await setMemberRoles(member.id, next);
      showToast(t("Roles updated ✓"));
      router.refresh();
    });
  }

  function resetPassword() {
    if (!confirm(t("Reset {name}'s password? Their current password stops working.", { name: member.name }))) return;
    setCredentials(null);
    run(async () => {
      setCredentials(await adminResetPassword(member.id));
      showToast(t("Password reset ✓"));
    });
  }

  function toggleActive() {
    const question = member.isActive
      ? t("Deactivate {name}? They are signed out and can't sign in until reactivated. Their patients, seller record and commission history stay as they are.", { name: member.name })
      : t("Reactivate {name}? They can sign in again.", { name: member.name });
    if (!confirm(question)) return;
    run(async () => {
      await setSellerActive(member.id, !member.isActive);
      showToast(member.isActive ? t("User deactivated ✓") : t("User reactivated ✓"));
      router.refresh();
    });
  }

  return (
    <>
      <Card className="space-y-5 p-6">
        <div>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t("Roles")}</h2>
          {editable ? (
            <RoleChips roles={member.roles} options={roles} disabled={pending} onToggle={toggleRole} />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {member.roles.map((key) => (
                <Badge key={key} tone={key === "admin" ? "blue" : "slate"}>
                  {t(roles.find((r) => r.key === key)?.name ?? "Custom role")}
                </Badge>
              ))}
            </div>
          )}
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-teal-700 hover:underline"
            aria-expanded={showPerms}
            onClick={() => setShowPerms((s) => !s)}
          >
            {showPerms ? t("Hide what they can do") : t("What can they do?")}
          </button>
          {showPerms && <div className="mt-2 rounded-lg bg-slate-50 p-3">{permissionSummary}</div>}
        </div>

        {editable && <DetailsForm member={member} disabled={pending} onSaved={() => router.refresh()} />}

        {editable && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={resetPassword}>
              {t("Reset password")}
            </Button>
            <Button type="button" variant={member.isActive ? "danger" : "secondary"} size="sm" disabled={pending} onClick={toggleActive}>
              {member.isActive ? t("Deactivate") : t("Reactivate")}
            </Button>
            {canDelete && (
              <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setDeleting(true)}>
                {t("Delete…")}
              </Button>
            )}
          </div>
        )}
        {isSelf && <p className="text-sm text-slate-500">{t("This is you — change your own details on My profile.")}</p>}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {credentials && <CredentialNotice title={t("Password reset for")} email={credentials.email} tempPassword={credentials.tempPassword} />}
      </Card>

      {deleting && (
        <DeleteDialog
          member={member}
          coordinatedCount={coordinatedCount}
          others={others}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            showToast(t("User deleted ✓"));
            router.push("/users");
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function DetailsForm({ member, disabled, onSaved }: { member: Member; disabled: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const t = useT();
  const [name, setName] = useState(member.displayName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unchanged = name.trim() === (member.displayName ?? "") && phone.trim() === (member.phone ?? "");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateMemberProfile(member.id, name, phone);
        showToast(t("Details saved ✓"));
        onSaved();
      } catch (err) {
        setError(message(err, t("Failed to save")));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-100 pt-5">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{t("Details")}</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label>{t("Name")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={member.displayName ? undefined : t("They choose it at first sign-in")}
          />
        </div>
        <div>
          <Label>{t("Phone (with country code)")}</Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 900123" />
        </div>
        <Button type="submit" disabled={disabled || pending || unchanged}>
          {pending ? t("Saving…") : t("Save")}
        </Button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function DeleteDialog({
  member,
  coordinatedCount,
  others,
  onClose,
  onDeleted,
}: {
  member: Member;
  coordinatedCount: number | null;
  others: { id: string; name: string }[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const [heir, setHeir] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const askHandover = coordinatedCount === null || coordinatedCount > 0;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteSeller(member.id, heir || null);
        onDeleted();
      } catch (err) {
        setError(message(err, t("Failed to delete")));
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={t("Delete {name}?", { name: member.name })}>
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          {rich(t("This removes their login for good. {deactivating} is usually better: it keeps everything and can be undone."), {
            deactivating: <strong>{t("Deactivating")}</strong>,
          })}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("Patients they sold and their commission history stay, under a seller without an account.")}</li>
          <li>{t("Their quotes and tasks are handed to you.")}</li>
          <li>{t("The activity history keeps what they did, marked as a deleted user.")}</li>
        </ul>
        {askHandover && (
          <div>
            <Label>
              {coordinatedCount === null
                ? t("Patients they coordinate go to")
                : coordinatedCount === 1
                  ? t("The 1 patient they coordinate goes to")
                  : t("The {n} patients they coordinate go to", { n: coordinatedCount })}
            </Label>
            <Select value={heir} onChange={(e) => setHeir(e.target.value)}>
              <option value="">{t("Nobody (no coordinator)")}</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>{t("Type DELETE to confirm")}</Label>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" variant="danger" disabled={pending || typed.trim() !== "DELETE"} onClick={handleDelete}>
            {pending ? t("Deleting…") : t("Delete for good")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
