import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getProfiles, getRateHistory, getSellers, getSettings, getTeamMembers, getTransferCompanies } from "@/lib/data";
import { SettingsClient } from "./SettingsClient";
import { getViewer } from "@/lib/viewer";
import { can, canAny } from "@/lib/permissions";
import { getClinicRoles } from "@/lib/roles";
import { getSecretsStatus } from "@/lib/whatsapp";
import { headers } from "next/headers";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await getViewer();
  const user = viewer ? { id: viewer.userId, email: viewer.email } : null;
  const [patients, settings, profiles, clinicConfig, transferCompanies, sellers] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, user?.id ?? ""),
    getProfiles(supabase),
    getClinicConfig(supabase),
    getTransferCompanies(supabase),
    getSellers(supabase),
  ]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY"
      ? await getRateHistory(supabase, settings.currency)
      : [];
  const myProfile = profiles.find((p) => p.id === user?.id) ?? null;
  const teamMembers = await getTeamMembers(profiles, canAny(viewer, ["team.view", "team.manage"]));
  const roles = viewer ? await getClinicRoles(supabase, viewer.clinicId) : [];
  const memberCounts: Record<string, number> = {};
  for (const p of profiles) for (const r of p.roles ?? []) memberCounts[r] = (memberCounts[r] ?? 0) + 1;
  const sellerRecords = can(viewer, "sellers.manage")
    ? await Promise.all(
        sellers
          .filter((s) => !s.profile_id)
          .map(async (seller) => ({
            seller,
            patientCount: patients.filter((p) => p.responsible_seller_id === seller.id).length,
            commission: await getSettings(supabase, seller.id),
          }))
      )
    : [];
  const whatsappSecrets = viewer && can(viewer, "messaging.manage") ? await getSecretsStatus(viewer.clinicId) : null;
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
      sellerRecords={sellerRecords}
      allSellers={sellers}
      currentUserId={user?.id ?? ""}
      currentUserEmail={user?.email ?? ""}
      currentDisplayName={myProfile?.display_name ?? ""}
      telegramConnected={!!myProfile?.telegram_chat_id}
      clinicConfig={clinicConfig}
      transferCompanies={transferCompanies}
      initialTab={tab}
      whatsappSecrets={whatsappSecrets}
      webhookUrl={webhookUrl}
      roles={roles}
      memberCounts={memberCounts}
      myRoles={viewer?.roles ?? []}
      modules={viewer?.modules ?? []}
    />
  );
}
