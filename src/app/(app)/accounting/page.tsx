import { createClient } from "@/lib/supabase/server";
import {
  getClinicConfig,
  getOpenBalanceCandidateIds,
  getPatientIdsPaidIn,
  getPatients,
  getPaymentMonths,
  getProfiles,
  getSellers,
  hasForeignMoney,
} from "@/lib/data";
import { addMonths } from "@/lib/commission";
import { clinicTodayIso } from "@/lib/balance";
import { AccountingClient } from "./AccountingClient";
import { requirePagePermission } from "@/lib/permissions";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePagePermission("accounting.view");
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;
  const thisMonth = clinicTodayIso().slice(0, 7);
  const month = monthParam && MONTH_KEY_RE.test(monthParam) ? monthParam : thisMonth;

  const clinicConfig = await getClinicConfig(supabase);
  // Only the patients this page shows: those paid in the chosen month (the ledger) and those
  // whose balance may not add up (open balances — the balance rules narrow them further).
  const [paidIds, openIds, paymentMonths, anyForeign, profiles, sellers] = await Promise.all([
    getPatientIdsPaidIn(supabase, { from: `${month}-01`, to: `${addMonths(month, 1)}-01` }),
    getOpenBalanceCandidateIds(supabase),
    getPaymentMonths(supabase),
    hasForeignMoney(supabase, clinicConfig.mainCurrency),
    getProfiles(supabase),
    getSellers(supabase),
  ]);
  const patients = await getPatients(supabase, { ids: [...new Set([...paidIds, ...openIds])] });
  const months = [...new Set([thisMonth, month, ...paymentMonths])].sort().reverse();

  return (
    <AccountingClient
      patients={patients}
      month={month}
      months={months}
      anyForeign={anyForeign}
      profiles={profiles}
      sellers={sellers}
    />
  );
}
