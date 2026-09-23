import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSettings } from "@/lib/data";
import { PatientsClient } from "./PatientsClient";
import { getViewerUser } from "@/lib/viewer";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; open?: string }>;
}) {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
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
      initialOpenId={params.open ?? null}
      profiles={profiles}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
    />
  );
}
