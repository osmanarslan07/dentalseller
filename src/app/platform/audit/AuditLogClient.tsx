"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlatformAuditEntry } from "@/lib/platform";
import { formatActivityTime } from "@/lib/activity-log";
import { Badge, Card, Select } from "@/components/ui";

const ACTION_TONES: Record<string, "slate" | "green" | "amber" | "blue" | "red"> = {
  clinic_created: "green",
  clinic_reactivated: "green",
  clinic_suspended: "red",
  password_reset: "amber",
  superadmin_added: "blue",
};

export function AuditLogClient({
  entries,
  actionOptions,
  clinicOptions,
  initialClinic,
  limit,
}: {
  entries: PlatformAuditEntry[];
  actionOptions: [string, string][];
  clinicOptions: [string, string][];
  initialClinic: string;
  limit: number;
}) {
  const [action, setAction] = useState("all");
  const [clinic, setClinic] = useState(
    initialClinic === "all" || clinicOptions.some(([id]) => id === initialClinic) ? initialClinic : "all"
  );

  const rows = useMemo(
    () =>
      entries.filter((e) => (action === "all" || e.action === action) && (clinic === "all" || e.clinicId === clinic)),
    [entries, action, clinic]
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="sm:max-w-[220px]">
          <option value="all">All actions</option>
          {actionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={clinic} onChange={(e) => setClinic(e.target.value)} className="sm:max-w-[260px]">
          <option value="all">All clinics</option>
          {clinicOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-slate-400 sm:ml-auto">
          {entries.length >= limit ? `Latest ${limit} entries` : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-3 pl-4 pr-4 font-medium">When</th>
              <th className="py-3 pr-4 font-medium">Who</th>
              <th className="py-3 pr-4 font-medium">Action</th>
              <th className="py-3 pr-4 font-medium">Target</th>
              <th className="py-3 pr-4 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 align-top last:border-0">
                <td className="whitespace-nowrap py-3 pl-4 pr-4 tabular-nums text-slate-500">
                  {formatActivityTime(e.createdAt)}
                </td>
                <td className="py-3 pr-4 text-slate-900">{e.actorName}</td>
                <td className="py-3 pr-4">
                  <Badge tone={ACTION_TONES[e.action] ?? "slate"}>{e.actionLabel}</Badge>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-slate-900">{e.targetLabel}</span>
                  {/* for a person, name the clinic they belong to; a clinic target is already named */}
                  {e.clinicId && e.clinicName && e.clinicName !== e.targetLabel && (
                    <span className="block text-xs text-slate-400">{e.clinicName}</span>
                  )}
                  {e.clinicId && (
                    <Link href={`/platform/clinics/${e.clinicId}`} className="block text-xs text-teal-700 hover:underline">
                      Open clinic
                    </Link>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-500">{e.detail ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  {entries.length === 0
                    ? "Nothing yet. Creating, editing or suspending a clinic, resetting a password or adding a superadmin will show up here."
                    : "No entries match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
