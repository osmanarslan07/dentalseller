import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getQuotes, getSellers } from "@/lib/data";
import { QuotesClient } from "./QuotesClient";
import { getViewerUser } from "@/lib/viewer";
import { requirePagePermission } from "@/lib/permissions";

export default async function QuotesPage() {
  await requirePagePermission("quotes.use");
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const user = await getViewerUser();
  const [quotes, sellers, clinicConfig] = await Promise.all([getQuotes(supabase), getSellers(supabase), getClinicConfig(supabase)]);
  // a new quote starts in the currency this seller usually agrees prices in
  const usual = sellers.find((s) => s.id === user?.id)?.default_currency;
  const allowed = [clinicConfig.mainCurrency, ...clinicConfig.dealCurrencies];
  const defaultCurrency = usual && allowed.includes(usual) ? usual : clinicConfig.mainCurrency;

  return <QuotesClient quotes={quotes} defaultCurrency={defaultCurrency} />;
}
