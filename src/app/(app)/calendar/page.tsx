import { createClient } from "@/lib/supabase/server";
import { getPatients } from "@/lib/data";
import { CalendarClient } from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const patients = await getPatients(supabase);

  return <CalendarClient patients={patients} />;
}
