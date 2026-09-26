import { createClient } from "@/lib/supabase/server";
import { getProfiles, getSellers, getStayOptions } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { getCoordinatorOptions } from "@/lib/coordinators";

/** Everything the patient page needs besides the patient itself: the team (seller picker,
 * history names), the seller list (accounts and sellers without one), who's looking, and previously-used hotels/room types for autocomplete. */
export async function loadPatientPageContext() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await getViewer();
  const currentUserId = viewer?.userId ?? "";
  const [profiles, sellers, stay] = await Promise.all([getProfiles(supabase), getSellers(supabase), getStayOptions(supabase)]);
  // record/reassign a patient for any seller, or type a new one
  const canAssignSellers = can(viewer, "sellers.assign");
  // who may be picked as coordinator (patients.edit), plus anyone still coordinating someone
  const coordinators = viewer ? await getCoordinatorOptions(supabase, viewer.clinicId, profiles) : [];

  return {
    supabase,
    profiles,
    sellers,
    currentUserId,
    canAssignSellers,
    coordinators,
    hotelOptions: stay.hotels,
    roomTypeOptions: stay.roomTypes,
  };
}
