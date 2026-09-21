import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getProfiles, getRateHistory, getSettings } from "@/lib/data";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [patients, settings, profiles] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
  ]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY"
      ? await getRateHistory(supabase, settings.currency)
      : [];
  const myProfile = profiles.find((p) => p.id === user?.id) ?? null;
  const isAdmin = myProfile?.role === "admin";
  const clinicConfig = isAdmin ? await getClinicConfig(supabase) : { telegramGroupChatId: null };

  return (
    <SettingsClient
      settings={settings}
      patients={patients}
      rateHistory={rateHistory}
      profiles={profiles}
      currentUserId={user?.id ?? ""}
      currentUserEmail={user?.email ?? ""}
      currentDisplayName={myProfile?.display_name ?? ""}
      telegramConnected={!!myProfile?.telegram_chat_id}
      telegramGroupChatId={clinicConfig.telegramGroupChatId}
      isAdmin={isAdmin}
    />
  );
}
