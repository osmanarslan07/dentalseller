import Link from "next/link";
import { countSystemProblems, getClinicsWithStats, getMonthlyUsage, getSystemStatus } from "@/lib/platform";
import { monthLabel, currentMonthKey } from "@/lib/commission";
import { StatCard } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { CheckCircleIcon, LayersIcon, PeopleIcon, TagIcon } from "@/components/StatIcons";
import { ClinicsTable } from "./ClinicsTable";
import { NeedsAttentionPanel } from "./HealthFlags";
import { UsageTrends } from "./UsageTrends";
import { getT } from "@/i18n/server";
import { msg } from "@/i18n";

export default async function PlatformOverviewPage() {
  const [clinics, usage, system] = await Promise.all([getClinicsWithStats(), getMonthlyUsage(), getSystemStatus()]);
  const systemProblems = countSystemProblems(system);
  const t = await getT();
  const thisMonth = monthLabel(currentMonthKey());

  const sum = (pick: (c: (typeof clinics)[number]) => number) => clinics.reduce((acc, c) => acc + pick(c), 0);
  const activeClinics = clinics.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("Platform overview")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("Every clinic on DentalSeller. Counts only: patient details stay inside each clinic.")}
          </p>
          <Link
            href="/platform/status"
            className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium hover:underline ${
              systemProblems ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${systemProblems ? "bg-amber-500" : "bg-emerald-500"}`} />
            {systemProblems
              ? t("System: {n} problem(s), view status", { n: systemProblems })
              : t("System: all jobs and Telegram healthy")}
          </Link>
        </div>
        <Link
          href="/platform/clinics/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          {t("New clinic")}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("Clinics")}
          value={clinics.length}
          sublabel={
            clinics.length > activeClinics
              ? t("{a} active, {s} suspended", { a: activeClinics, s: clinics.length - activeClinics })
              : t("{a} active", { a: activeClinics })
          }
          icon={<LayersIcon className="h-5 w-5" />}
        />
        <StatCard
          label={t("Active users")}
          value={sum((c) => c.stats.activeUsers)}
          sublabel={t("{online} online now · {admins} admins, {sellers} sellers", {
            online: sum((c) => c.stats.onlineNow),
            admins: sum((c) => c.stats.admins),
            sellers: sum((c) => c.stats.sellers),
          })}
          icon={<PeopleIcon className="h-5 w-5" />}
        />
        <StatCard
          label={t("Patients confirmed")}
          value={sum((c) => c.stats.patientsConfirmedThisMonth)}
          sublabel={t("{month}, {n} all-time", { month: thisMonth, n: sum((c) => c.stats.patients) })}
          icon={<CheckCircleIcon className="h-5 w-5" />}
        />
        <StatCard
          label={t("Quotes created")}
          value={sum((c) => c.stats.quotesThisMonth)}
          sublabel={t("{month}, {n} all-time", { month: thisMonth, n: sum((c) => c.stats.quotes) })}
          icon={<TagIcon className="h-5 w-5" />}
        />
      </div>

      <NeedsAttentionPanel clinics={clinics} />

      <ClinicsTable clinics={clinics} />

      <UsageTrends title={msg("Platform usage, month by month")} data={usage} />
    </div>
  );
}
