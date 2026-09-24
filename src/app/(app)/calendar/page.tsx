import { createClient } from "@/lib/supabase/server";
import { getPatients, getSellers } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";
import { getViewerUser } from "@/lib/viewer";

export default async function CalendarPage() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [patients, sellers] = await Promise.all([getPatients(supabase), getSellers(supabase)]);

  return <CalendarClient patients={patients} sellers={sellers} currentUserId={user?.id ?? ""} />;
}
