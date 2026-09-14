import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [patients, profiles] = await Promise.all([getPatients(supabase), getProfiles(supabase)]);

  return <CalendarClient patients={patients} profiles={profiles} />;
}
