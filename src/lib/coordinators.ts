import { SupabaseClient } from "@supabase/supabase-js";
import { PatientRoster, Profile } from "@/types";
import { getCoordinatingIds } from "@/lib/data";
import { getClinicRoles } from "@/lib/roles";
import { flattenCalendarEvents } from "@/lib/calendar-events";
import { PeopleFilter, cleanPeopleFilter, hasVisitToCome, resolveFilter } from "@/lib/people-filter";

export { hasVisitToCome };

export interface CoordinatorOption {
  id: string;
  name: string;
  /** May be picked for a patient now (signed in at least once, active, with patients.edit).
   * Others are only listed because they still coordinate someone. */
  pickable: boolean;
}

/** Who can coordinate patients: active members whose roles include patients.edit (the
 * database checks the same when a coordinator is set) and who have signed in — an invited
 * account has no name yet and follows nobody up. Anyone still coordinating a patient
 * — deactivated, or since moved to a role without it — stays listed so filters and existing
 * patients keep showing them. `patients` narrows "still coordinating" to those patients (the
 * Transfers page: people coordinating a listed transfer); without it, any patient of the clinic. */
export async function getCoordinatorOptions(
  supabase: SupabaseClient,
  clinicId: string,
  profiles: Profile[],
  patients?: { coordinator_id: string | null }[]
): Promise<CoordinatorOption[]> {
  const [roles, coordinating] = await Promise.all([
    getClinicRoles(supabase, clinicId),
    patients
      ? new Set(patients.map((p) => p.coordinator_id).filter((id): id is string => !!id))
      : getCoordinatingIds(supabase),
  ]);
  const editors = new Set(roles.filter((r) => r.permissions.includes("patients.edit")).map((r) => r.key));
  return profiles
    .map((p) => ({
      id: p.id,
      name: p.display_name || "Not signed in yet",
      pickable: !!p.display_name && p.is_active && (p.roles ?? []).some((r) => editors.has(r)),
    }))
    .filter((o) => o.pickable || coordinating.has(o.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What a page's Seller / Coordinator filter starts on: a link's ?seller= / ?coordinator=
 * (comma-separated; e.g. from the workload card) wins, else the viewer's saved default. */
export function initialPeopleFilter(
  params: { seller?: string; coordinator?: string },
  saved: PeopleFilter | undefined,
  sellerIds: Set<string>,
  coordinatorIds: Set<string>,
  currentUserId: string
): PeopleFilter {
  const fromLink = params.seller || params.coordinator ? cleanPeopleFilter(params) : null;
  return resolveFilter(fromLink ?? saved, sellerIds, coordinatorIds, currentUserId);
}

const ARRIVAL_KINDS = new Set(["visit1_arrival", "visit2_arrival", "visit1_self", "visit2_self", "extra_visit"]);
export const WORKLOAD_DAYS = 14;

export interface CoordinatorWorkload {
  /** Coordinated patients with a visit still to come. */
  active: number;
  /** Their arrivals (or self-arranged / extra visits) in the next WORKLOAD_DAYS days, today included. */
  arriving: number;
}

/** The days "arriving" counts: today up to (not including) WORKLOAD_DAYS from now. */
export function workloadWindow(todayIso: string): { from: string; to: string } {
  const end = new Date(`${todayIso}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + WORKLOAD_DAYS);
  return { from: todayIso, to: end.toISOString().slice(0, 10) };
}

/** Per coordinator id. `todayIso` is the clinic's today (YYYY-MM-DD). `patients` must hold
 * every coordinated patient with a visit to come or dated in the window (see
 * getPatientRoster's `coordinatedActive`); others don't change the numbers. */
export function coordinatorWorkload(patients: PatientRoster[], todayIso: string): Map<string, CoordinatorWorkload> {
  const endIso = workloadWindow(todayIso).to;

  const out = new Map<string, CoordinatorWorkload>();
  const coordinated = patients.filter((p) => p.coordinator_id);
  for (const p of coordinated) {
    const w = out.get(p.coordinator_id!) ?? { active: 0, arriving: 0 };
    if (hasVisitToCome(p)) w.active += 1;
    out.set(p.coordinator_id!, w);
  }
  for (const e of flattenCalendarEvents(coordinated)) {
    if (!ARRIVAL_KINDS.has(e.kind) || e.date < todayIso || e.date >= endIso) continue;
    const p = coordinated.find((x) => x.id === e.patientId);
    if (p?.coordinator_id) out.get(p.coordinator_id)!.arriving += 1;
  }
  return out;
}
