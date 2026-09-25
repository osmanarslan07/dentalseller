import Link from "next/link";
import { notFound } from "next/navigation";
import { getClinicMembers, getClinicWithStats, getMonthlyUsage } from "@/lib/platform";
import { currentMonthKey, monthLabel } from "@/lib/commission";
import { formatActivityTime } from "@/lib/activity-log";
import { formatDate } from "@/lib/format";
import { Badge, StatCard } from "@/components/ui";
import { ClinicDetailsCard } from "./ClinicDetailsCard";
import { ClinicTeamCard } from "./ClinicTeamCard";
import { HealthCard } from "../../HealthFlags";
import { OnboardingCard } from "../../Onboarding";
import { UsageTrends } from "../../UsageTrends";
import { TERMS_VERSION } from "@/lib/terms";
import { BillingCard } from "./BillingCard";
import { SupportModeButton } from "./SupportModeButton";
import { getLang, getT } from "@/i18n/server";
import { localeOf, msg } from "@/i18n";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [clinic, members, usage] = await Promise.all([getClinicWithStats(id), getClinicMembers(id), getMonthlyUsage(id)]);
  if (!clinic) notFound();
  const t = await getT();
  const locale = localeOf(await getLang());

  const thisMonth = monthLabel(currentMonthKey(), locale);
  const { stats } = clinic;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform" className="text-sm text-slate-500 hover:text-slate-700">
          ← {t("All clinics")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{clinic.name}</h1>
          {clinic.is_active ? <Badge tone="green">{t("Active")}</Badge> : <Badge tone="amber">{t("Suspended")}</Badge>}
          <div className="ml-auto">
            <SupportModeButton clinicId={clinic.id} />
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {t("Created {date}", { date: formatDate(clinic.created_at.slice(0, 10)) })}
          {stats.lastActivityAt && <> · {t("last activity {when}", { when: formatActivityTime(stats.lastActivityAt) })}</>}
          {" · "}
          <Link href={`/platform/clinics/${clinic.id}/activity`} className="text-teal-700 hover:underline">
            {t("Clinic activity")}
          </Link>
          {" · "}
          <Link href={`/platform/audit?clinic=${clinic.id}`} className="text-teal-700 hover:underline">
            {t("Platform audit log")}
          </Link>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t("Terms:")}{" "}
          {clinic.termsAcceptance ? (
            <>
              {t("v{version} accepted {when}", { version: clinic.termsAcceptance.version, when: formatActivityTime(clinic.termsAcceptance.acceptedAt) })}
              {clinic.termsAcceptance.acceptedBy && <> {t("by {name}", { name: clinic.termsAcceptance.acceptedBy })}</>}
              {!clinic.termsAcceptance.current && (
                <span className="text-amber-700"> · {t("not the current version (v{version})", { version: TERMS_VERSION })}</span>
              )}
            </>
          ) : (
            <span className="text-amber-700">{t("not accepted yet")}</span>
          )}
          {" · "}
          <Link href="/terms" className="text-teal-700 hover:underline">
            {t("View terms")}
          </Link>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("Active users")}
          value={stats.activeUsers}
          sublabel={t("{online} online now · {admins} admins, {sellers} sellers", { online: stats.onlineNow, admins: stats.admins, sellers: stats.sellers })}
        />
        <StatCard label={t("Patients")} value={stats.patients} sublabel={t("all-time")} />
        <StatCard label={t("Confirmed this month")} value={stats.patientsConfirmedThisMonth} sublabel={thisMonth} />
        <StatCard label={t("Quotes this month")} value={stats.quotesThisMonth} sublabel={t("{n} all-time", { n: stats.quotes })} />
      </div>

      <HealthCard flags={clinic.health} />

      <OnboardingCard steps={clinic.onboarding} />

      <UsageTrends title={msg("Usage, month by month")} data={usage} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <ClinicDetailsCard clinic={clinic} />
          <BillingCard clinicId={clinic.id} billing={clinic.billing} modules={clinic.modules ?? []} activeAccounts={stats.activeUsers} />
        </div>
        <ClinicTeamCard members={members} />
      </div>
    </div>
  );
}
