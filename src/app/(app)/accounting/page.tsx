import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles } from "@/lib/data";
import { AccountingClient } from "./AccountingClient";

export default async function AccountingPage() {
  const supabase = await createClient();
  const [patients, profiles] = await Promise.all([getPatients(supabase), getProfiles(supabase)]);

  return <AccountingClient patients={patients} profiles={profiles} />;
}
