import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSellers } from "@/lib/data";
import { getViewerUser } from "@/lib/viewer";
import { Patient } from "@/types";

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

/** Everything the patient page needs besides the patient itself: the team (seller picker,
 * history names), the seller list (accounts and sellers without one), who's looking, and previously-used hotels/room types for autocomplete. */
export async function loadPatientPageContext() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const currentUserId = user?.id ?? "";
  const [patients, profiles, sellers] = await Promise.all([getPatients(supabase), getProfiles(supabase), getSellers(supabase)]);
  const isAdmin = profiles.find((p) => p.id === currentUserId)?.role === "admin";

  return {
    supabase,
    patients,
    profiles,
    sellers,
    currentUserId,
    isAdmin,
    hotelOptions: distinct(patients.flatMap((p: Patient) => [p.visit1_hotel_name, p.visit2_hotel_name])),
    roomTypeOptions: distinct(patients.flatMap((p: Patient) => [p.visit1_room_type, p.visit2_room_type])),
  };
}
