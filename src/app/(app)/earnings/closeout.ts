import { CommissionSettings, Patient } from "@/types";
import { computeMonthlyAggregates, monthKey } from "@/lib/commission";

export interface CloseoutStats {
  confirmed: number;
  visitsDone: number;
  paymentsReceived: number;
  paymentsTotal: number;
  commission: number;
}

/** The monthly close-out numbers for each of `months`, worked out on the server so the page
 * sends a few numbers per month instead of the seller's patients. `patients` must hold every
 * patient credited to the seller (getPatients' `creditedTo`). */
export function closeoutStats(
  patients: Patient[],
  currentUserId: string,
  settings: CommissionSettings,
  months: string[]
): Record<string, CloseoutStats> {
  // Pipeline counts (confirmed/visits done) follow current ownership; money follows
  // visit-level attribution so a reassigned-away patient's already-earned commission
  // still counts here — see patientCommissionContribution in lib/commission.
  const own = patients.filter((p) => p.responsible_seller_id === currentUserId);
  const aggregateMap = new Map(computeMonthlyAggregates(patients, settings, currentUserId).map((a) => [a.month, a]));

  const out: Record<string, CloseoutStats> = {};
  for (const month of months) {
    let confirmed = 0;
    let visit1Done = 0;
    let visit2Done = 0;
    let paymentsReceived = 0;
    for (const p of own) {
      if (p.confirmation_date && monthKey(p.confirmation_date) === month) confirmed++;
      if (p.visit1_date && monthKey(p.visit1_date) === month && p.visit1_status === "completed") visit1Done++;
      if (p.visit2_date && monthKey(p.visit2_date) === month && p.visit2_status === "completed") visit2Done++;
      if (p.visit1_date && monthKey(p.visit1_date) === month && p.visit1_actual != null) paymentsReceived++;
      if (p.visit2_date && monthKey(p.visit2_date) === month && p.visit2_actual != null) paymentsReceived++;
    }
    const agg = aggregateMap.get(month);
    out[month] = {
      confirmed,
      visitsDone: visit1Done + visit2Done,
      paymentsReceived,
      paymentsTotal: agg?.actualTotal ?? 0,
      commission: agg?.actualCommission ?? settings.fixed_monthly_payment,
    };
  }
  return out;
}
