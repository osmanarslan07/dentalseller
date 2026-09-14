import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { PatientsClient } from "./PatientsClient";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";
  const [patients, settings, profiles, params] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, currentUserId),
    getProfiles(supabase),
    searchParams,
  ]);
  const isAdmin = profiles.find((p) => p.id === currentUserId)?.role === "admin";

  return (
    <PatientsClient
      patients={patients}
      settings={settings}
      initialQuery={params.q ?? ""}
      profiles={profiles}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
    />
  );
}
