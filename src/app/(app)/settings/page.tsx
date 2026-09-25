import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfiles, getRateHistory, getSettings } from "@/lib/data";
import { MySettingsClient } from "./MySettingsClient";
import { getViewer } from "@/lib/viewer";
import { getClinicRoles } from "@/lib/roles";
import { ClinicSectionId, clinicSectionHref, firstClinicSection, visibleClinicSections } from "./clinic/sections";
import { Permission } from "@/types";

/** Old links (/settings?tab=…) from before Clinic settings had sections: each clinic-wide tab
 * now lives in these sections, tried in order until one the viewer may see. */
const OLD_TAB_SECTIONS: Record<string, ClinicSectionId[]> = {
  clinic: ["users", "clinic", "sales", "messaging"],
  roles: ["roles"],
  system: ["money"],
  transfers: ["operations", "messaging"],
  data: ["data"],
};

function oldTabTarget(tab: string, permissions: Permission[]): string {
  const visible = visibleClinicSections(permissions);
  const id = (OLD_TAB_SECTIONS[tab] ?? []).find((s) => visible.some((v) => v.id === s));
  const section = id ? { id } : firstClinicSection(permissions);
  return section ? clinicSectionHref(section.id) : "/settings";
}

/** My settings: what is personal to whoever is signed in. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await getViewer();
  if (tab && tab in OLD_TAB_SECTIONS) redirect(oldTabTarget(tab, viewer?.permissions ?? []));

  const user = viewer ? { id: viewer.userId, email: viewer.email } : null;
  const [settings, profiles] = await Promise.all([getSettings(supabase, user?.id ?? ""), getProfiles(supabase)]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY" ? await getRateHistory(supabase, settings.currency) : [];
  const myProfile = profiles.find((p) => p.id === user?.id) ?? null;
  const roles = viewer ? await getClinicRoles(supabase, viewer.clinicId) : [];

  return (
    <MySettingsClient
      key={tab ?? "account"}
      settings={settings}
      rateHistory={rateHistory}
      currentUserEmail={user?.email ?? ""}
      currentDisplayName={myProfile?.display_name ?? ""}
      telegramConnected={!!myProfile?.telegram_chat_id}
      initialTab={tab}
      roles={roles}
      myRoles={viewer?.roles ?? []}
      modules={viewer?.modules ?? []}
    />
  );
}
