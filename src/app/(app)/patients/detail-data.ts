import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSellers } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { Patient } from "@/types";
import { getCoordinatorOptions } from "@/lib/coordinators";

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

/** Everything the patient page needs besides the patient itself: the team (seller picker,
 * history names), the seller list (accounts and sellers without one), who's looking, and previously-used hotels/room types for autocomplete. */
export async function loadPatientPageContext() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await getViewer();
  const currentUserId = viewer?.userId ?? "";
  const [patients, profiles, sellers] = await Promise.all([getPatients(supabase), getProfiles(supabase), getSellers(supabase)]);
  // record/reassign a patient for any seller, or type a new one
  const canAssignSellers = can(viewer, "sellers.assign");
  // who may be picked as coordinator (patients.edit), plus anyone still coordinating someone
  const coordinators = viewer ? await getCoordinatorOptions(supabase, viewer.clinicId, profiles, patients) : [];

  return {
    supabase,
    patients,
    profiles,
    sellers,
    currentUserId,
    canAssignSellers,
    coordinators,
    hotelOptions: distinct(patients.flatMap((p: Patient) => [p.visit1_hotel_name, p.visit2_hotel_name])),
    roomTypeOptions: distinct(patients.flatMap((p: Patient) => [p.visit1_room_type, p.visit2_room_type])),
  };
}
