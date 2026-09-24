"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeamMember } from "@/lib/data";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { MEMBER_ROLES, MemberRole, ROLE_LABELS } from "@/types";
import { useToast } from "@/components/Toast";
import {
  addSeller,
  adminResetPassword,
  deleteSeller,
  setSellerActive,
  setMemberRoles,
  AddSellerResult,
} from "./team-actions";

interface CredentialResult extends AddSellerResult {
  kind: "created" | "reset";
}

export function TeamCard({
  members,
  currentUserId,
  canManage,
}: {
  members: TeamMember[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [newRoles, setNewRoles] = useState<MemberRole[]>(["sales"]);
  const [error, setError] = useState<string | null>(null);
  const [credentialResult, setCredentialResult] = useState<CredentialResult | null>(null);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCredentialResult(null);
    startTransition(async () => {
      try {
        const r = await addSeller(email, newRoles);
        setCredentialResult({ ...r, kind: "created" });
        setEmail("");
        setNewRoles(["sales"]);
        showToast("Team member added ✓");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add seller");
      }
    });
  }

  function copyPassword() {
    if (!credentialResult) return;
    navigator.clipboard.writeText(credentialResult.tempPassword).then(() => showToast("Password copied"));
  }

  async function handleToggleActive(member: TeamMember) {
    setRowError(null);
    setRowPendingId(member.id);
    try {
      await setSellerActive(member.id, !member.isActive);
      showToast(member.isActive ? "Seller deactivated ✓" : "Seller reactivated ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update seller");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleToggleRole(member: TeamMember, role: MemberRole) {
    const next = member.roles.includes(role) ? member.roles.filter((x) => x !== role) : [...member.roles, role];
    if (next.length === 0) {
      setRowError("Everyone needs at least one role — deactivate the account instead.");
      return;
    }
    if (role === "admin" && !confirm(`${next.includes("admin") ? "Make" : "Remove"} ${member.displayName || "this member"} ${next.includes("admin") ? "an admin" : "as admin"}?`)) return;
    setRowError(null);
    setRowPendingId(member.id);
    try {
      await setMemberRoles(member.id, next);
      showToast("Roles updated ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update roles");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleDelete(member: TeamMember) {
    if (
      !confirm(
        `Permanently delete ${member.displayName || member.email || member.id}? This can't be undone. Their patients and commission history stay with them as a seller without an account; their quotes and tasks will be reassigned to you.`
      )
    )
      return;
    setRowError(null);
    setCredentialResult(null);
    setRowPendingId(member.id);
    try {
      await deleteSeller(member.id);
      showToast("Seller deleted ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to delete seller");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleResetPassword(member: TeamMember) {
    if (!confirm(`Reset ${member.displayName || "this seller"}'s password?`)) return;
    setRowError(null);
    setCredentialResult(null);
    setRowPendingId(member.id);
    try {
      const r = await adminResetPassword(member.id);
      setCredentialResult({ ...r, kind: "reset" });
      showToast("Password reset ✓");
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setRowPendingId(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Team</h2>
      <p className="mb-5 text-sm text-slate-500">
        Sales see every patient and the calendar, but only their own commission. Coordinators run patients,
        visits, transfers and payments; accountants see the money. Someone can have several roles.
      </p>

      <ul className="mb-5 divide-y divide-slate-100">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          const rowBusy = rowPendingId === m.id;
          return (
            <li key={m.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">
                {m.displayName || "Invited — awaiting first login"}
                {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                {m.email && <span className="ml-1.5 text-xs font-normal text-slate-400">{m.email}</span>}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(!canManage || isSelf) &&
                  m.roles.map((role) => (
                    <Badge key={role} tone={role === "admin" ? "blue" : "slate"}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  ))}
                {!m.isActive && <Badge tone="amber">Inactive</Badge>}
                {!m.displayName && <Badge tone="slate">Pending</Badge>}
                {canManage && !isSelf && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={rowBusy}
                      onClick={() => handleResetPassword(m)}
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={m.isActive ? "danger" : "secondary"}
                      disabled={rowBusy}
                      onClick={() => handleToggleActive(m)}
                    >
                      {m.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={rowBusy}
                      onClick={() => handleDelete(m)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
              </div>
              {canManage && !isSelf && (
                <RoleChips roles={m.roles} disabled={rowBusy} onToggle={(role) => handleToggleRole(m, role)} />
              )}
            </li>
          );
        })}
      </ul>

      {rowError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

      {canManage && (
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>Add a team member by email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <Button type="submit" disabled={pending || newRoles.length === 0}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
        <RoleChips
          roles={newRoles}
          disabled={pending}
          onToggle={(role) => setNewRoles((rs) => (rs.includes(role) ? rs.filter((x) => x !== role) : [...rs, role]))}
        />
      </form>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {credentialResult && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">
            {credentialResult.kind === "created" ? "Account created for" : "Password reset for"}{" "}
            {credentialResult.email}
          </p>
          <p className="mt-1">
            Temporary password:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">{credentialResult.tempPassword}</code>
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            Share this with them directly, not by email — this password is shown once and isn&apos;t saved
            anywhere.
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={copyPassword}>
            Copy password
          </Button>
        </div>
      )}
    </Card>
  );
}

/** One tick-button per role; the member holds every role that's on. */
function RoleChips({
  roles,
  disabled,
  onToggle,
}: {
  roles: MemberRole[];
  disabled?: boolean;
  onToggle: (role: MemberRole) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Roles">
      <span className="text-xs text-slate-500">Roles:</span>
      {MEMBER_ROLES.map((role) => {
        const on = roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(role)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-50 ${
              on ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {on ? "✓ " : ""}
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
