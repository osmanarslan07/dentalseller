import { createClient } from "@/lib/supabase/server";
import { getPatientRoster, getProfiles, getSavedFilters, getSellerIdsWithPatients, getSellers } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";
import { requirePagePermission } from "@/lib/permissions";
import { getCoordinatorOptions, initialPeopleFilter } from "@/lib/coordinators";
import { ALL_FILTER } from "@/lib/people-filter";
import { clinicTodayIso } from "@/lib/balance";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** YYYY-MM-DD, `days` from `iso`. */
function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await requirePagePermission("patients.view");
  const { month: monthParam } = await searchParams;
  const month = monthParam && MONTH_KEY_RE.test(monthParam) ? monthParam : clinicTodayIso().slice(0, 7);
  const supabase = await createClient();

  // The month grid shows whole weeks, so up to six days of the months either side: a week of
  // margin each way covers every day on screen.
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextFirst = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const onScreen = { from: shiftIso(first, -7), to: shiftIso(nextFirst, 7) };

  const [patients, sellers, profiles, saved, sellerIds] = await Promise.all([
    getPatientRoster(supabase, { eventsIn: onScreen }),
    getSellers(supabase),
    getProfiles(supabase),
    getSavedFilters(supabase, viewer.userId),
    getSellerIdsWithPatients(supabase),
  ]);
  const coordinators = await getCoordinatorOptions(supabase, viewer.clinicId, profiles);
  const initialFilter = initialPeopleFilter(
    {},
    saved.calendar,
    new Set(sellers.map((s) => s.id)),
    new Set(coordinators.map((c) => c.id)),
    viewer.userId
  );

  return (
    <CalendarClient
      month={month}
      patients={patients}
      sellers={sellers}
      sellerIdsWithPatients={[...sellerIds]}
      coordinators={coordinators}
      initialFilter={initialFilter}
      savedFilter={saved.calendar ?? ALL_FILTER}
      currentUserId={viewer.userId}
    />
  );
}
