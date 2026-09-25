"use client";

import { ReactNode, useMemo, useState } from "react";
import { Patient, Seller } from "@/types";
import { StatCard } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { CheckCircleIcon, PeopleIcon, UserPlusIcon } from "@/components/StatIcons";
import { PeopleFilterBar, PersonOption } from "@/components/PeopleFilterBar";
import { addMonths, currentMonthKey } from "@/lib/commission";
import { PeopleFilter, matchesPeopleFilter, onlyMine, sellerFilterOptions } from "@/lib/people-filter";
import { TeamOperationsPanel } from "./TeamOperationsPanel";
import { useT } from "@/i18n/client";

type CountCardId = "patients_sold" | "confirmed_this_month" | "new_patients_delta";

/** The dashboard below its header: one Seller / Coordinator filter drives both the count
 * cards and the operations panel. Only patient counts and operational figures live here —
 * commission stays on Earnings — so any filter is safe for anyone who can see patients. */
export function DashboardClient({
  allPatients,
  sellers,
  coordinators,
  cardIds,
  initialFilter,
  savedFilter,
  currentUserId,
  todayIso,
  monthAheadIso,
}: {
  allPatients: Patient[];
  sellers: Seller[];
  coordinators: PersonOption[];
  /** The count cards the viewer chose to see, in their order (none for non-sellers). */
  cardIds: CountCardId[];
  initialFilter: PeopleFilter;
  savedFilter: PeopleFilter;
  currentUserId: string;
  todayIso: string;
  monthAheadIso: string;
}) {
  const t = useT();
  const [filter, setFilter] = useState(initialFilter);
  const patients = useMemo(
    () => allPatients.filter((p) => matchesPeopleFilter(p, filter, currentUserId)),
    [allPatients, filter, currentUserId]
  );

  const sellerOptions = useMemo(() => sellerFilterOptions(sellers), [sellers]);

  const counts = useMemo(() => {
    const thisMonth = currentMonthKey();
    const lastMonth = addMonths(thisMonth, -1);
    const inMonth = (m: string) => patients.filter((p) => p.confirmation_date?.slice(0, 7) === m).length;
    return { total: patients.length, thisMonth: inMonth(thisMonth), lastMonth: inMonth(lastMonth) };
  }, [patients]);
  const delta = counts.thisMonth - counts.lastMonth;

  const cards: Record<CountCardId, ReactNode> = {
    patients_sold: (
      <StatCard
        label={t("Total patients sold")}
        value={<CountUp value={counts.total} />}
        sublabel={t("{n} confirmed this month", { n: counts.thisMonth })}
        icon={<PeopleIcon className="h-4 w-4" />}
      />
    ),
    confirmed_this_month: (
      <StatCard
        label={t("Patients sold this month")}
        value={<CountUp value={counts.thisMonth} />}
        sublabel={t("vs {n} last month", { n: counts.lastMonth })}
        icon={<CheckCircleIcon className="h-4 w-4" />}
      />
    ),
    new_patients_delta: (
      <StatCard
        label={t("New patients vs last month")}
        value={<CountUp value={delta} signed />}
        sublabel={t("{a} this month, {b} last month", { a: counts.thisMonth, b: counts.lastMonth })}
        icon={<UserPlusIcon className="h-4 w-4" />}
      />
    ),
  };

  return (
    <>
      <PeopleFilterBar
        page="dashboard"
        value={filter}
        onChange={setFilter}
        sellers={sellerOptions}
        coordinators={coordinators}
        savedDefault={savedFilter}
        currentUserId={currentUserId}
      />

      {cardIds.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cardIds.map((id) => (
            <div key={id}>{cards[id]}</div>
          ))}
        </div>
      )}

      <TeamOperationsPanel
        patients={patients}
        showResponsible={!onlyMine(filter)}
        sellers={sellers}
        todayIso={todayIso}
        monthAheadIso={monthAheadIso}
      />
    </>
  );
}
