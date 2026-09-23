"use client";

import { useState } from "react";
import type { ClinicMember } from "@/lib/platform";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui";
import { CredentialResult, resetClinicUserPassword } from "../../actions";
import { CredentialNotice } from "../../CredentialNotice";

/** Read-only directory: the clinic's own admin manages its team. The one thing done from
 * here is a password reset, for when the person locked out is the only one who could. */
export function ClinicTeamCard({ members }: { members: ClinicMember[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialResult | null>(null);

  async function handleReset(member: ClinicMember) {
    if (!confirm(`Reset the password for ${member.displayName || member.email}? Their current password stops working.`)) return;
    setError(null);
    setCredential(null);
    setPendingId(member.id);
    try {
      setCredential(await resetClinicUserPassword(member.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setPendingId(null);
    }
  }

  const sorted = [...members].sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Team</h2>
        <p className="mt-1 text-xs text-slate-500">Managed by the clinic&apos;s own admins from their Settings page.</p>
      </div>

      {(error || credential) && (
        <div className="border-b border-slate-100 p-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {credential && (
            <CredentialNotice title="Password reset for" email={credential.email} tempPassword={credential.tempPassword} />
          )}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {sorted.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{member.displayName || "Not signed in yet"}</span>
                {member.role === "admin" && <Badge tone="blue">Admin</Badge>}
                {!member.isActive && <Badge tone="amber">Deactivated</Badge>}
              </div>
              <p className="truncate text-xs text-slate-500">
                {member.email ?? "—"} · joined {formatDate(member.createdAt.slice(0, 10))}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendingId === member.id}
              onClick={() => handleReset(member)}
            >
              {pendingId === member.id ? "Resetting…" : "Reset password"}
            </Button>
          </li>
        ))}
        {members.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-400">No accounts yet.</li>}
      </ul>
    </Card>
  );
}
