"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlatformPerson } from "@/lib/platform";
import { matchesQuery } from "@/lib/search";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { LastSeen } from "@/components/LastSeen";
import { CredentialResult, resetClinicUserPassword } from "../actions";
import { CredentialNotice } from "@/components/CredentialNotice";

type RoleFilter = "all" | "admin" | "seller" | "superadmin";
type StatusFilter = "all" | "active" | "deactivated" | "never";

const ROLE_BADGE: Record<string, { tone: "blue" | "slate" | "green"; label: string }> = {
  admin: { tone: "blue", label: "Admin" },
  seller: { tone: "slate", label: "Seller" },
  superadmin: { tone: "green", label: "Superadmin" },
};

export function PeopleClient({ people, initialQuery }: { people: PlatformPerson[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialResult | null>(null);

  const rows = useMemo(
    () =>
      people.filter((p) => {
        if (role !== "all" && p.role !== role) return false;
        if (status === "active" && !p.isActive) return false;
        if (status === "deactivated" && p.isActive) return false;
        if (status === "never" && p.lastSignInAt) return false;
        return matchesQuery(query, [p.displayName, p.email, p.clinicName]);
      }),
    [people, query, role, status]
  );

  async function handleReset(person: PlatformPerson) {
    if (!confirm(`Reset the password for ${person.displayName || person.email}? Their current password stops working.`)) return;
    setError(null);
    setCredential(null);
    setPendingId(person.id);
    try {
      setCredential(await resetClinicUserPassword(person.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <Input
          autoFocus
          type="search"
          placeholder="Search name, email or clinic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
          aria-label="Search people"
        />
        <Select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} className="sm:max-w-[160px]">
          <option value="all">All roles</option>
          <option value="admin">Admins</option>
          <option value="seller">Sellers</option>
          <option value="superadmin">Superadmins</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="sm:max-w-[190px]">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="never">Never signed in</option>
        </Select>
        <p className="text-xs text-slate-400 sm:ml-auto">
          {rows.length} of {people.length}
        </p>
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
        {rows.map((p) => {
          const badge = ROLE_BADGE[p.role] ?? ROLE_BADGE.seller;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {p.displayName || (p.lastSignInAt ? "No name set" : "Not signed in yet")}
                  </span>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  {!p.isActive && <Badge tone="amber">Deactivated</Badge>}
                  <LastSeen lastSeenAt={p.lastSeenAt} lastSignInAt={p.lastSignInAt} />
                </div>
                <p className="truncate text-xs text-slate-500">
                  {p.email ?? "—"} · {p.clinicName ?? (p.role === "superadmin" ? "Platform" : "No clinic")}
                  {p.clinicId && !p.clinicActive && <span className="text-amber-700"> (suspended)</span>} · joined{" "}
                  {formatDate(p.createdAt.slice(0, 10))}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {p.clinicId && (
                  <Link
                    href={`/platform/clinics/${p.clinicId}`}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Open clinic
                  </Link>
                )}
                {p.clinicId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendingId === p.id}
                    onClick={() => handleReset(p)}
                  >
                    {pendingId === p.id ? "Resetting…" : "Reset password"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-5 py-12 text-center text-sm text-slate-400">
            No one matches{query.trim() ? ` "${query.trim()}"` : " these filters"}.
          </li>
        )}
      </ul>
    </Card>
  );
}
