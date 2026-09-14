import { createClient } from "@/lib/supabase/server";
import { getQuotes, getSettings } from "@/lib/data";
import { QuotesClient } from "./QuotesClient";

export default async function QuotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [quotes, settings] = await Promise.all([getQuotes(supabase), getSettings(supabase, user?.id ?? "")]);

  return <QuotesClient quotes={quotes} defaultCurrency={settings.currency} />;
}
