import { createClient } from "@/lib/supabase/server";
import { getQuotes, getSettings } from "@/lib/data";
import { QuotesClient } from "./QuotesClient";
import { getViewerUser } from "@/lib/viewer";
import { requirePagePermission } from "@/lib/permissions";

export default async function QuotesPage() {
  await requirePagePermission("quotes.use");
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [quotes, settings] = await Promise.all([getQuotes(supabase), getSettings(supabase, user?.id ?? "")]);

  return <QuotesClient quotes={quotes} defaultCurrency={settings.currency} />;
}
