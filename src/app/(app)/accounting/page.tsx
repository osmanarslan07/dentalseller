import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSellers } from "@/lib/data";
import { AccountingClient } from "./AccountingClient";
import { requirePagePermission } from "@/lib/permissions";

export default async function AccountingPage() {
  await requirePagePermission("accounting.view");
  const supabase = await createClient();
  const [patients, profiles, sellers] = await Promise.all([getPatients(supabase), getProfiles(supabase), getSellers(supabase)]);

  return <AccountingClient patients={patients} profiles={profiles} sellers={sellers} />;
}
