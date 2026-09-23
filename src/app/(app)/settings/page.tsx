import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getProfiles, getRateHistory, getSettings, getTeamMembers } from "@/lib/data";
import { SettingsClient } from "./SettingsClient";
import { getViewerUser } from "@/lib/viewer";

export default async function SettingsPage() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [patients, settings, profiles, clinicConfig] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
    getClinicConfig(supabase),
  ]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY"
      ? await getRateHistory(supabase, settings.currency)
      : [];
  const myProfile = profiles.find((p) => p.id === user?.id) ?? null;
  const isAdmin = myProfile?.role === "admin";
  const teamMembers = await getTeamMembers(profiles, isAdmin);

  return (
    <SettingsClient
      settings={settings}
      patients={patients}
      rateHistory={rateHistory}
      teamMembers={teamMembers}
      currentUserId={user?.id ?? ""}
      currentUserEmail={user?.email ?? ""}
      currentDisplayName={myProfile?.display_name ?? ""}
      telegramConnected={!!myProfile?.telegram_chat_id}
      clinicConfig={clinicConfig}
      isAdmin={isAdmin}
    />
  );
}
