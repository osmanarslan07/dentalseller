"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeamMember } from "@/lib/data";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  addSeller,
  adminResetPassword,
  deleteSeller,
  setSellerActive,
  setSellerRole,
  AddSellerResult,
} from "./team-actions";

interface CredentialResult extends AddSellerResult {
  kind: "created" | "reset";
}

export function TeamCard({
  members,
  currentUserId,
  isAdmin,
}: {
  members: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
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
        const r = await addSeller(email);
        setCredentialResult({ ...r, kind: "created" });
        setEmail("");
        showToast("Seller added ✓");
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

  async function handleToggleRole(member: TeamMember) {
    const nextRole = member.role === "admin" ? "seller" : "admin";
    if (!confirm(`${nextRole === "admin" ? "Promote" : "Demote"} ${member.displayName || "this seller"}?`)) return;
    setRowError(null);
    setRowPendingId(member.id);
    try {
      await setSellerRole(member.id, nextRole);
      showToast(nextRole === "admin" ? "Promoted to admin ✓" : "Demoted to seller ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update role");
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
        Sellers can see each other&apos;s patients and calendar, but never each other&apos;s commission.
      </p>

      <ul className="mb-5 divide-y divide-slate-100">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          const rowBusy = rowPendingId === m.id;
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium text-slate-900">
                {m.displayName || "Invited — awaiting first login"}
                {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                {m.email && <span className="ml-1.5 text-xs font-normal text-slate-400">{m.email}</span>}
              </span>
              <div className="flex items-center gap-1.5">
                {m.role === "admin" && <Badge tone="blue">Admin</Badge>}
                {!m.isActive && <Badge tone="amber">Inactive</Badge>}
                {!m.displayName && <Badge tone="slate">Pending</Badge>}
                {isAdmin && !isSelf && (
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
                      variant="secondary"
                      disabled={rowBusy}
                      onClick={() => handleToggleRole(m)}
                    >
                      {m.role === "admin" ? "Demote" : "Promote"}
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
            </li>
          );
        })}
      </ul>

      {rowError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Add a seller by email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seller@example.com"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add seller"}
        </Button>
      </form>

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
