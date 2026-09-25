"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClinicWithStats } from "@/lib/platform";
import { formatDate, pluralize } from "@/lib/format";
import { formatActivityTime } from "@/lib/activity-log";
import { Badge, Card, Input } from "@/components/ui";
import { severityRank, worstSeverity } from "@/lib/clinic-health";
import { HealthSummary } from "./HealthFlags";
import { OnboardingTag } from "./Onboarding";
import { formatPrice, PLAN_LABELS, trialStatus } from "@/lib/clinic-billing";
import { useT } from "@/i18n/client";

type SortKey = "name" | "health" | "users" | "patients" | "activity" | "created";

// text columns read best A→Z first; numeric/date columns read best highest/newest first
const DEFAULT_SORT_DIR: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  // asc = worst first (critical ranks lowest)
  health: "asc",
  users: "desc",
  patients: "desc",
  activity: "desc",
  created: "desc",
};

function sortValue(clinic: ClinicWithStats, key: SortKey): string | number {
  switch (key) {
    case "name":
      return clinic.name.toLowerCase();
    case "health":
      return severityRank(worstSeverity(clinic.health));
    case "users":
      return clinic.stats.admins + clinic.stats.sellers;
    case "patients":
      return clinic.stats.patients;
    case "activity":
      return clinic.stats.lastActivityAt ?? "";
    case "created":
      return clinic.created_at;
  }
}

export function ClinicsTable({ clinics }: { clinics: ClinicWithStats[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const router = useRouter();
  const t = useT();

  function handleHeaderSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? clinics.filter((c) => c.name.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q))
      : clinics;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [clinics, search, sortKey, sortDir]);

  const header = (label: string, key: SortKey) => (
    <SortHeader label={t(label)} sortKey={key} activeKey={sortKey} dir={sortDir} onSort={handleHeaderSort} />
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t("Clinics")}</h2>
        <Input
          placeholder={t("Search name or slug…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="py-3 pl-4 pr-4">{header("Clinic", "name")}</th>
              <th className="py-3 pr-4">{header("Health", "health")}</th>
              <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-slate-400">{t("Plan")}</th>
              <th className="py-3 pr-4">{header("Team", "users")}</th>
              <th className="py-3 pr-4">{header("Patients", "patients")}</th>
              <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-slate-400">{t("Quotes")}</th>
              <th className="py-3 pr-4">{header("Last activity", "activity")}</th>
              <th className="py-3 pr-4">{header("Created", "created")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((clinic) => (
              <tr
                key={clinic.id}
                onClick={() => router.push(`/platform/clinics/${clinic.id}`)}
                className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50/80"
              >
                <td className="py-3 pl-4 pr-4">
                  <Link
                    href={`/platform/clinics/${clinic.id}`}
                    className="font-medium text-slate-900 hover:text-teal-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {clinic.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    {clinic.slug && <span>{clinic.slug}</span>}
                    {!clinic.is_active && <Badge tone="amber">{t("Suspended")}</Badge>}
                    <OnboardingTag steps={clinic.onboarding} />
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <HealthSummary flags={clinic.health} />
                </td>
                <td className="py-3 pr-4">
                  <PlanCell clinic={clinic} />
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {pluralize(clinic.stats.admins, "admin")}, {pluralize(clinic.stats.sellers, "seller")}
                  {clinic.stats.onlineNow > 0 && (
                    <span className="ml-1 text-xs text-emerald-600">· {clinic.stats.onlineNow} online</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {clinic.stats.patients}
                  {clinic.stats.patientsConfirmedThisMonth > 0 && (
                    <span className="ml-1 text-xs text-emerald-600">+{clinic.stats.patientsConfirmedThisMonth} this month</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">{clinic.stats.quotes}</td>
                <td className="py-3 pr-4 text-slate-600">
                  {clinic.stats.lastActivityAt ? formatActivityTime(clinic.stats.lastActivityAt) : "—"}
                </td>
                <td className="py-3 pr-4 text-slate-600">{formatDate(clinic.created_at.slice(0, 10))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  {clinics.length === 0 ? t("No clinics yet.") : t("No clinics match your search.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlanCell({ clinic }: { clinic: ClinicWithStats }) {
  const t = useT();
  const b = clinic.billing;
  if (!b) return <span className="text-xs text-slate-400">{t("Not set")}</span>;
  const trial = trialStatus(b);
  return (
    <div className="text-sm">
      <span className="text-slate-900">{t(PLAN_LABELS[b.plan])}</span>
      {b.monthlyPrice !== null && (
        <span className="text-slate-500"> · {t("{amount}/month", { amount: formatPrice(b.monthlyPrice, b.currency) })}</span>
      )}
      {trial.kind === "active" && (
        <span className="block text-xs text-slate-400">
          {trial.daysLeft === 0 ? t("ends today") : trial.daysLeft === 1 ? t("1 day left") : t("{n} days left", { n: trial.daysLeft })}
        </span>
      )}
      {trial.kind === "expired" && <span className="block text-xs text-red-600">{t("expired")}</span>}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-slate-600 ${
        active ? "text-slate-600" : "text-slate-400"
      }`}
    >
      {label} {active && (dir === "asc" ? "↑" : "↓")}
    </button>
  );
}
