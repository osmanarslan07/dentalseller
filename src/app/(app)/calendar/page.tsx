import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSavedFilters, getSellers } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";
import { requirePagePermission } from "@/lib/permissions";
import { getCoordinatorOptions, initialPeopleFilter } from "@/lib/coordinators";
import { ALL_FILTER } from "@/lib/people-filter";

export default async function CalendarPage() {
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await requirePagePermission("patients.view");
  const supabase = await createClient();
  const [patients, sellers, profiles, saved] = await Promise.all([
    getPatients(supabase),
    getSellers(supabase),
    getProfiles(supabase),
    getSavedFilters(supabase, viewer.userId),
  ]);
  const coordinators = await getCoordinatorOptions(supabase, viewer.clinicId, profiles, patients);
  const initialFilter = initialPeopleFilter(
    {},
    saved.calendar,
    new Set(sellers.map((s) => s.id)),
    new Set(coordinators.map((c) => c.id))
  );

  return (
    <CalendarClient
      patients={patients}
      sellers={sellers}
      coordinators={coordinators}
      initialFilter={initialFilter}
      savedFilter={saved.calendar ?? ALL_FILTER}
      currentUserId={viewer.userId}
    />
  );
}
