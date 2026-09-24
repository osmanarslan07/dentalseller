import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getSellers, getSettings } from "@/lib/data";
import { PatientsClient } from "./PatientsClient";
import { getViewerUser } from "@/lib/viewer";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; open?: string }>;
}) {
  const params = await searchParams;
  // old links (?open=<id>) opened the edit popup — the patient has its own page now
  if (params.open) redirect(`/patients/${params.open}`);

  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const currentUserId = user?.id ?? "";
  const [patients, settings, sellers] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, currentUserId),
    getSellers(supabase),
  ]);
  return (
    <PatientsClient
      patients={patients}
      settings={settings}
      initialQuery={params.q ?? ""}
      sellers={sellers}
      currentUserId={currentUserId}
    />
  );
}
