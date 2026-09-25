import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getProfiles, getSavedFilters, getSellers, getTransferCompanies, getTransfersInRange } from "@/lib/data";
import { getCoordinatorOptions, initialPeopleFilter } from "@/lib/coordinators";
import { ALL_FILTER, sellerFilterOptions } from "@/lib/people-filter";
import { clinicTodayIso } from "@/lib/balance";
import { TransfersClient } from "./TransfersClient";
import { can, requirePagePermission } from "@/lib/permissions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; days?: string }>;
}) {
  const viewer = await requirePagePermission("transfers.manage");
  const params = await searchParams;
  const today = clinicTodayIso();
  const from = params.date && ISO_DATE.test(params.date) ? params.date : today;
  const days = [1, 2, 7].includes(Number(params.days)) ? Number(params.days) : 2;
  const to = addDays(from, days - 1);

  const supabase = await createClient();
  const [transfers, companies, clinicConfig, sellers, profiles, saved] = await Promise.all([
    getTransfersInRange(supabase, from, to),
    getTransferCompanies(supabase),
    getClinicConfig(supabase),
    getSellers(supabase),
    getProfiles(supabase),
    getSavedFilters(supabase, viewer.userId),
  ]);
  const coordinators = await getCoordinatorOptions(supabase, viewer.clinicId, profiles, transfers.map((t) => t.patient));
  const initialFilter = initialPeopleFilter(
    {},
    saved.transfers,
    new Set(sellers.map((s) => s.id)),
    new Set(coordinators.map((c) => c.id)),
    viewer.userId
  );

  return (
    <TransfersClient
      transfers={transfers}
      companies={companies}
      driverMessages={clinicConfig.driverMessages.mode}
      isAdmin={can(viewer, "messaging.manage")}
      from={from}
      days={days}
      today={today}
      dates={Array.from({ length: days }, (_, i) => addDays(from, i))}
      prevDate={addDays(from, -days)}
      nextDate={addDays(from, days)}
      sellers={sellerFilterOptions(sellers)}
      coordinators={coordinators}
      initialFilter={initialFilter}
      savedFilter={saved.transfers ?? ALL_FILTER}
      currentUserId={viewer.userId}
    />
  );
}
