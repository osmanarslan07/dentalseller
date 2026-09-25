import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSavedFilters, getSellers, getSettings } from "@/lib/data";
import { PatientsClient } from "./PatientsClient";
import { requirePagePermission } from "@/lib/permissions";
import { getCoordinatorOptions, initialPeopleFilter } from "@/lib/coordinators";
import { ALL_FILTER } from "@/lib/people-filter";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; open?: string; seller?: string; coordinator?: string }>;
}) {
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await requirePagePermission("patients.view");
  const params = await searchParams;
  // old links (?open=<id>) opened the edit popup — the patient has its own page now
  if (params.open) redirect(`/patients/${params.open}`);

  const supabase = await createClient();
  const currentUserId = viewer.userId;
  const [patients, settings, sellers, profiles, saved] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, currentUserId),
    getSellers(supabase),
    getProfiles(supabase),
    getSavedFilters(supabase, currentUserId),
  ]);
  const coordinators = await getCoordinatorOptions(supabase, viewer.clinicId, profiles, patients);
  const initialFilter = initialPeopleFilter(
    params,
    saved.patients,
    new Set(sellers.map((s) => s.id)),
    new Set(coordinators.map((c) => c.id))
  );
  return (
    <PatientsClient
      key={`${params.q ?? ""}|${params.seller ?? ""}|${params.coordinator ?? ""}`}
      patients={patients}
      settings={settings}
      initialQuery={params.q ?? ""}
      sellers={sellers}
      coordinators={coordinators}
      initialFilter={initialFilter}
      savedFilter={saved.patients ?? ALL_FILTER}
      currentUserId={currentUserId}
    />
  );
}
