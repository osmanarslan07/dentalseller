import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";
import { getViewerUser } from "@/lib/viewer";

export default async function CalendarPage() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [patients, profiles] = await Promise.all([getPatients(supabase), getProfiles(supabase)]);

  return <CalendarClient patients={patients} profiles={profiles} currentUserId={user?.id ?? ""} />;
}
