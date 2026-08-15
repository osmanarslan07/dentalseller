import { createClient } from "@/lib/supabase/server";
import { getPatients, getSettings } from "@/lib/data";
import { PatientsClient } from "./PatientsClient";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const [patients, settings, params] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase),
    searchParams,
  ]);

  return <PatientsClient patients={patients} settings={settings} initialQuery={params.q ?? ""} />;
}
