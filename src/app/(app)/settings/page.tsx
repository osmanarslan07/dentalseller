import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getProfiles, getRateHistory, getSettings, getTeamMembers, getTransferCompanies } from "@/lib/data";
import { SettingsClient } from "./SettingsClient";
import { getViewer, getViewerUser } from "@/lib/viewer";
import { getSecretsStatus } from "@/lib/whatsapp";
import { headers } from "next/headers";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [patients, settings, profiles, clinicConfig, transferCompanies] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
    getClinicConfig(supabase),
    getTransferCompanies(supabase),
  ]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY"
      ? await getRateHistory(supabase, settings.currency)
      : [];
  const myProfile = profiles.find((p) => p.id === user?.id) ?? null;
  const isAdmin = myProfile?.role === "admin";
  const teamMembers = await getTeamMembers(profiles, isAdmin);
  const viewer = isAdmin ? await getViewer() : null;
  const whatsappSecrets = viewer ? await getSecretsStatus(viewer.clinicId) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/whatsapp/webhook`;

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
      transferCompanies={transferCompanies}
      isAdmin={isAdmin}
      initialTab={tab}
      whatsappSecrets={whatsappSecrets}
      webhookUrl={webhookUrl}
    />
  );
}
