import Link from "next/link";
import { notFound } from "next/navigation";
import { getClinicMembers, getClinicWithStats } from "@/lib/platform";
import { currentMonthKey, monthLabel } from "@/lib/commission";
import { formatActivityTime } from "@/lib/activity-log";
import { formatDate, pluralize } from "@/lib/format";
import { Badge, StatCard } from "@/components/ui";
import { ClinicDetailsCard } from "./ClinicDetailsCard";
import { ClinicTeamCard } from "./ClinicTeamCard";
import { HealthCard } from "../../HealthFlags";
import { OnboardingCard } from "../../Onboarding";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [clinic, members] = await Promise.all([getClinicWithStats(id), getClinicMembers(id)]);
  if (!clinic) notFound();

  const thisMonth = monthLabel(currentMonthKey());
  const { stats } = clinic;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform" className="text-sm text-slate-500 hover:text-slate-700">
          ← All clinics
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{clinic.name}</h1>
          {clinic.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Suspended</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Created {formatDate(clinic.created_at.slice(0, 10))}
          {stats.lastActivityAt && <> · last activity {formatActivityTime(stats.lastActivityAt)}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active users" value={stats.activeUsers} sublabel={`${stats.onlineNow} online now · ${pluralize(stats.admins, "admin")}, ${pluralize(stats.sellers, "seller")}`} />
        <StatCard label="Patients" value={stats.patients} sublabel="all-time" />
        <StatCard label="Confirmed this month" value={stats.patientsConfirmedThisMonth} sublabel={thisMonth} />
        <StatCard label="Quotes this month" value={stats.quotesThisMonth} sublabel={`${stats.quotes} all-time`} />
      </div>

      <HealthCard flags={clinic.health} />

      <OnboardingCard steps={clinic.onboarding} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ClinicDetailsCard clinic={clinic} />
        <ClinicTeamCard members={members} />
      </div>
    </div>
  );
}
