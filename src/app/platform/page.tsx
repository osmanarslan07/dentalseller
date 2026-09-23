import Link from "next/link";
import { getClinicsWithStats } from "@/lib/platform";
import { monthLabel, currentMonthKey } from "@/lib/commission";
import { StatCard } from "@/components/ui";
import { CheckCircleIcon, LayersIcon, PeopleIcon, TagIcon } from "@/components/StatIcons";
import { ClinicsTable } from "./ClinicsTable";

export default async function PlatformOverviewPage() {
  const clinics = await getClinicsWithStats();
  const thisMonth = monthLabel(currentMonthKey());

  const sum = (pick: (c: (typeof clinics)[number]) => number) => clinics.reduce((acc, c) => acc + pick(c), 0);
  const activeClinics = clinics.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Platform overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every clinic on DentalSeller. Counts only: patient details stay inside each clinic.
          </p>
        </div>
        <Link
          href="/platform/clinics/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          New clinic
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clinics"
          value={clinics.length}
          sublabel={`${activeClinics} active${clinics.length > activeClinics ? `, ${clinics.length - activeClinics} suspended` : ""}`}
          icon={<LayersIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Active users"
          value={sum((c) => c.stats.activeUsers)}
          sublabel={`${sum((c) => c.stats.admins)} admins, ${sum((c) => c.stats.sellers)} sellers`}
          icon={<PeopleIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Patients confirmed"
          value={sum((c) => c.stats.patientsConfirmedThisMonth)}
          sublabel={`${thisMonth}, ${sum((c) => c.stats.patients)} all-time`}
          icon={<CheckCircleIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Quotes created"
          value={sum((c) => c.stats.quotesThisMonth)}
          sublabel={`${thisMonth}, ${sum((c) => c.stats.quotes)} all-time`}
          icon={<TagIcon className="h-5 w-5" />}
        />
      </div>

      <ClinicsTable clinics={clinics} />
    </div>
  );
}
