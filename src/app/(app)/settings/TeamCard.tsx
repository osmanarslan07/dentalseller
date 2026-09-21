"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Profile } from "@/types";
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
  profiles,
  currentUserId,
  isAdmin,
}: {
  profiles: Profile[];
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

  async function handleToggleActive(seller: Profile) {
    setRowError(null);
    setRowPendingId(seller.id);
    try {
      await setSellerActive(seller.id, !seller.is_active);
      showToast(seller.is_active ? "Seller deactivated ✓" : "Seller reactivated ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update seller");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleToggleRole(seller: Profile) {
    const nextRole = seller.role === "admin" ? "seller" : "admin";
    if (!confirm(`${nextRole === "admin" ? "Promote" : "Demote"} ${seller.display_name || "this seller"}?`)) return;
    setRowError(null);
    setRowPendingId(seller.id);
    try {
      await setSellerRole(seller.id, nextRole);
      showToast(nextRole === "admin" ? "Promoted to admin ✓" : "Demoted to seller ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleDelete(seller: Profile) {
    if (
      !confirm(
        `Permanently delete ${seller.display_name || seller.id}? This can't be undone. Any patients, quotes, and tasks they own will be reassigned to you.`
      )
    )
      return;
    setRowError(null);
    setCredentialResult(null);
    setRowPendingId(seller.id);
    try {
      await deleteSeller(seller.id);
      showToast("Seller deleted ✓");
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to delete seller");
    } finally {
      setRowPendingId(null);
    }
  }

  async function handleResetPassword(seller: Profile) {
    if (!confirm(`Reset ${seller.display_name || "this seller"}'s password?`)) return;
    setRowError(null);
    setCredentialResult(null);
    setRowPendingId(seller.id);
    try {
      const r = await adminResetPassword(seller.id);
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
        {profiles.map((p) => {
          const isSelf = p.id === currentUserId;
          const rowBusy = rowPendingId === p.id;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium text-slate-900">
                {p.display_name || "Invited — awaiting first login"}
                {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
              </span>
              <div className="flex items-center gap-1.5">
                {p.role === "admin" && <Badge tone="blue">Admin</Badge>}
                {!p.is_active && <Badge tone="amber">Inactive</Badge>}
                {!p.display_name && <Badge tone="slate">Pending</Badge>}
                {isAdmin && !isSelf && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={rowBusy}
                      onClick={() => handleResetPassword(p)}
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={rowBusy}
                      onClick={() => handleToggleRole(p)}
                    >
                      {p.role === "admin" ? "Demote" : "Promote"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={p.is_active ? "danger" : "secondary"}
                      disabled={rowBusy}
                      onClick={() => handleToggleActive(p)}
                    >
                      {p.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={rowBusy}
                      onClick={() => handleDelete(p)}
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
