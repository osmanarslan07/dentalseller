import { SupabaseClient } from "@supabase/supabase-js";
import { Patient, Profile } from "@/types";
import { getClinicRoles } from "@/lib/roles";
import { flattenCalendarEvents } from "@/lib/calendar-events";
import { PeopleFilter, cleanPeopleFilter, resolveFilter } from "@/lib/people-filter";

export interface CoordinatorOption {
  id: string;
  name: string;
  /** May be picked for a patient now (active, with patients.edit). Others are only listed
   * because they still coordinate someone. */
  pickable: boolean;
}

/** Who can coordinate patients: active members whose roles include patients.edit (the
 * database checks the same when a coordinator is set). Anyone still coordinating a patient
 * — deactivated, or since moved to a role without it — stays listed so filters and existing
 * patients keep showing them. */
export async function getCoordinatorOptions(
  supabase: SupabaseClient,
  clinicId: string,
  profiles: Profile[],
  patients: Pick<Patient, "coordinator_id">[]
): Promise<CoordinatorOption[]> {
  const roles = await getClinicRoles(supabase, clinicId);
  const editors = new Set(roles.filter((r) => r.permissions.includes("patients.edit")).map((r) => r.key));
  const coordinating = new Set(patients.map((p) => p.coordinator_id).filter((id): id is string => !!id));
  return profiles
    .map((p) => ({
      id: p.id,
      name: p.display_name || "Not signed in yet",
      pickable: p.is_active && (p.roles ?? []).some((r) => editors.has(r)),
    }))
    .filter((o) => o.pickable || coordinating.has(o.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What a page's Seller / Coordinator filter starts on: a link's ?seller= / ?coordinator=
 * (e.g. from the workload card) wins, else the viewer's saved default; a saved id that is
 * no longer offered falls back to All. */
export function initialPeopleFilter(
  params: { seller?: string; coordinator?: string },
  saved: PeopleFilter | undefined,
  sellerIds: Set<string>,
  coordinatorIds: Set<string>
): PeopleFilter {
  if (params.seller || params.coordinator) {
    return resolveFilter(cleanPeopleFilter(params), sellerIds, coordinatorIds);
  }
  return resolveFilter(saved, sellerIds, coordinatorIds);
}

/** Still has a visit to come: an active patient for whoever follows them up. */
export function hasVisitToCome(p: {
  visit1_status: string;
  visit2_status: string;
  needs_visit2: boolean;
  extra_visits?: { status: string }[] | null;
}): boolean {
  return (
    p.visit1_status === "upcoming" ||
    (p.needs_visit2 && p.visit2_status === "upcoming") ||
    (p.extra_visits ?? []).some((v) => v.status === "upcoming")
  );
}

const ARRIVAL_KINDS = new Set(["visit1_arrival", "visit2_arrival", "visit1_self", "visit2_self", "extra_visit"]);
export const WORKLOAD_DAYS = 14;

export interface CoordinatorWorkload {
  /** Coordinated patients with a visit still to come. */
  active: number;
  /** Their arrivals (or self-arranged / extra visits) in the next WORKLOAD_DAYS days, today included. */
  arriving: number;
}

/** Per coordinator id. `todayIso` is the clinic's today (YYYY-MM-DD). */
export function coordinatorWorkload(patients: Patient[], todayIso: string): Map<string, CoordinatorWorkload> {
  const end = new Date(`${todayIso}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + WORKLOAD_DAYS);
  const endIso = end.toISOString().slice(0, 10);

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
