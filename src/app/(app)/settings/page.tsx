import { createClient } from "@/lib/supabase/server";
import { getPatients, getRateHistory, getSettings } from "@/lib/data";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [patients, settings] = await Promise.all([getPatients(supabase), getSettings(supabase)]);
  const rateHistory =
    settings.show_try && settings.currency !== "TRY"
      ? await getRateHistory(supabase, settings.currency)
      : [];

  return <SettingsClient settings={settings} patients={patients} rateHistory={rateHistory} />;
}
