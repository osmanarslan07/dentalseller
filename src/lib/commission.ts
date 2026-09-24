import { Celebration, CommissionSettings, DiscountType, Patient } from "@/types";
import { formatCurrency } from "@/lib/format";

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

/** Everything the patient is expected to pay across all visits: prices + extras − discounts. */
export function treatmentTotal(p: Patient): number {
  const keys: [string, number | null][] = [
    ["visit1", p.visit1_expected],
    ["visit2", p.visit2_expected],
    ...p.extra_visits.map((v) => [v.id, v.expected] as [string, number | null]),
  ];
  // extras not tied to one of these visits still count, as before
  const known = new Set(keys.map(([k]) => k));
  const orphanExtras = p.extras
    .filter((e) => !known.has(e.extra_visit_id ?? `visit${e.visit_number}`))
    .reduce((sum, e) => sum + e.total, 0);
  return keys.reduce((sum, [key, expected]) => sum + (visitExpectedTotal(p, key, expected) ?? 0), 0) + orphanExtras;
}

export interface VisitDiscountSetting {
  type: DiscountType;
  value: number;
  reason: string | null;
}

/** The discount stored on a visit ("visit1" | "visit2" | an extra visit's id), or null. */
export function visitDiscountSetting(p: Patient, visitKey: string): VisitDiscountSetting | null {
  const [type, value, reason] =
    visitKey === "visit1"
      ? [p.visit1_discount_type, p.visit1_discount_value, p.visit1_discount_reason]
      : visitKey === "visit2"
      ? [p.visit2_discount_type, p.visit2_discount_value, p.visit2_discount_reason]
      : (() => {
          const v = p.extra_visits.find((x) => x.id === visitKey);
          return [v?.discount_type ?? null, v?.discount_value ?? null, v?.discount_reason ?? null];
        })();
  if (!type || value == null || !(Number(value) > 0)) return null;
  return { type, value: Number(value), reason: reason ?? null };
}

/** How much comes off a visit whose price + extras is `base`: a % of it or a fixed amount,
 * never more than the base itself. The one place a discount becomes money — every total
 * (owed, still due, expected commission, reports, messages) goes through visitExpectedTotal. */
export function visitDiscount(p: Patient, visitKey: string, base: number): number {
  return discountAmount(visitDiscountSetting(p, visitKey), base);
}

/** The rule itself, for a discount setting and a visit's price + extras. */
export function discountAmount(d: VisitDiscountSetting | null, base: number): number {
  if (!d || base <= 0) return 0;
  const off = d.type === "percent" ? (base * Math.min(d.value, 100)) / 100 : d.value;
  return Math.round(Math.min(off, base) * 100) / 100;
}

/** Total of the extras sold on one visit ("visit1" | "visit2" | an extra visit's id). */
export function extrasTotalFor(p: Patient, visitKey: string): number {
  return p.extras
    .filter((e) => (e.extra_visit_id ?? `visit${e.visit_number}`) === visitKey)
    .reduce((sum, e) => sum + e.total, 0);
}

/** Hotel cost + external transfer costs of one visit — what the clinic spends on it. */
export function visitCosts(p: Patient, visitKey: string): { hotel: number; transfers: number } {
  const hotel =
    visitKey === "visit1"
      ? p.visit1_hotel_cost
      : visitKey === "visit2"
      ? p.visit2_hotel_cost
      : p.extra_visits.find((v) => v.id === visitKey)?.hotel_cost ?? null;
  const transfers = p.transfer_costs
    .filter((t) => (t.extra_visit_id ?? `visit${t.visit_number}`) === visitKey)
    .reduce((s, t) => s + (t.cost ?? 0), 0);
  return { hotel: hotel ?? 0, transfers };
}

/** An amount as commission sees it: minus the visit's costs when the clinic deducts them
 * (see Patient.commission_costs), never below zero. */
function afterCosts(p: Patient, visitKey: string, amount: number | null): number | null {
  if (amount == null || !p.commission_costs) return amount;
  return Math.max(0, amount - (p.commission_costs[visitKey] ?? 0));
}

/** What the patient is expected to pay for a visit: the agreed treatment price plus any
 * extras sold on it, minus its discount. Null only when there's neither price nor extras. */
export function visitExpectedTotal(p: Patient, visitKey: string, expected: number | null): number | null {
  const extras = extrasTotalFor(p, visitKey);
  if (expected == null && extras === 0) return null;
  const base = (expected ?? 0) + extras;
  return Math.round((base - visitDiscount(p, visitKey, base)) * 100) / 100;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function currentMonthKey(): string {
  return monthKey(new Date().toISOString());
}

export function rateForTotal(
  total: number,
  settings: CommissionSettings
): number {
  if (total <= settings.tier1_threshold) return settings.tier1_rate;
  if (total <= settings.tier2_threshold) return settings.tier2_rate;
  return settings.tier3_rate;
}

export function commissionForTotal(
  total: number,
  settings: CommissionSettings
): number {
  return total * rateForTotal(total, settings);
}

/** Human label for which tier a total falls into, e.g. "Up to £40,000". */
export function tierLabel(total: number, settings: CommissionSettings): string {
  if (total <= settings.tier1_threshold) {
    return `Up to ${formatCurrency(settings.tier1_threshold, settings.currency)}`;
  }
  if (total <= settings.tier2_threshold) {
    return `${formatCurrency(settings.tier1_threshold, settings.currency)}–${formatCurrency(settings.tier2_threshold, settings.currency)}`;
  }
  return `Above ${formatCurrency(settings.tier2_threshold, settings.currency)}`;
}

export interface MonthTotals {
  month: string;
  actualTotal: number;
  expectedTotal: number;
}

export interface MonthAggregate extends MonthTotals {
  actualRate: number;
  expectedRate: number;
  actualCommission: number;
  expectedCommission: number;
  patientCount: number;
}

interface Visit {
  date: string | null;
  expected: number | null;
  actual: number | null;
  status: "upcoming" | "completed";
  /** Who gets commission credit for this specific visit: the seller who earned it if it's
   * already been paid (locked in by a DB trigger, immune to later reassignment), otherwise
   * whoever currently owns the patient (since that's who'll actually close it). */
  ownerId: string;
}

function patientVisits(p: Patient): Visit[] {
  return [
    {
      date: p.visit1_date,
      expected: afterCosts(p, "visit1", visitExpectedTotal(p, "visit1", p.visit1_expected)),
      actual: afterCosts(p, "visit1", p.visit1_actual),
      status: p.visit1_status,
      ownerId: p.visit1_actual != null ? p.visit1_earned_by_seller_id ?? p.responsible_seller_id : p.responsible_seller_id,
    },
    {
      date: p.visit2_date,
      expected: afterCosts(p, "visit2", visitExpectedTotal(p, "visit2", p.visit2_expected)),
      actual: afterCosts(p, "visit2", p.visit2_actual),
      status: p.visit2_status,
      ownerId: p.visit2_actual != null ? p.visit2_earned_by_seller_id ?? p.responsible_seller_id : p.responsible_seller_id,
    },
    ...p.extra_visits.map((v) => ({
      date: v.visit_date,
      expected: afterCosts(p, v.id, visitExpectedTotal(p, v.id, v.expected)),
      actual: afterCosts(p, v.id, v.actual),
      status: v.status,
      ownerId: v.actual != null ? v.earned_by_seller_id ?? p.responsible_seller_id : p.responsible_seller_id,
    })),
  ];
}

/** All of a patient's visits, optionally narrowed to just the ones a given seller gets
 * commission credit for. Pass no sellerId to get every visit regardless of owner. */
function visitsForSeller(p: Patient, sellerId?: string): Visit[] {
  const visits = patientVisits(p);
  return sellerId == null ? visits : visits.filter((v) => v.ownerId === sellerId);
}

/** Distinct patients with at least one completed visit dated in the given month — "how many
 * patients actually came in" as opposed to how many were sold/confirmed. Pass sellerId to
 * count only visits that seller gets commission credit for. */
export function countPatientsWithCompletedVisitInMonth(
  patients: Patient[],
  month: string,
  sellerId?: string
): number {
  let count = 0;
  for (const p of patients) {
    const came = visitsForSeller(p, sellerId).some(
      (v) => v.status === "completed" && v.date && monthKey(v.date) === month
    );
    if (came) count++;
  }
  return count;
}

/** Raw actual/expected totals per calendar month, optionally narrowed to one seller's
 * commission-earning visits (a patient can straddle two sellers if it was reassigned
 * after some visits were already paid — see visitsForSeller). */
export function computeMonthTotals(patients: Patient[], sellerId?: string): Map<string, MonthTotals> {
  const map = new Map<string, MonthTotals>();

  const bump = (month: string, key: "actualTotal" | "expectedTotal", amount: number) => {
    const existing = map.get(month) ?? { month, actualTotal: 0, expectedTotal: 0 };
    existing[key] += amount;
    map.set(month, existing);
  };

  for (const p of patients) {
    for (const visit of visitsForSeller(p, sellerId)) {
      if (!visit.date) continue;
      const month = monthKey(visit.date);
      if (visit.actual != null) bump(month, "actualTotal", visit.actual);
      else if (visit.expected != null) bump(month, "expectedTotal", visit.expected);
    }
  }

  return map;
}

/** Expected total for visits with no date yet (e.g. visit2 not booked) —
 * kept out of the per-month map so they don't skew a specific month's bar. */
export function computeUnscheduledExpectedTotal(patients: Patient[], sellerId?: string): number {
  let total = 0;
  for (const p of patients) {
    for (const visit of visitsForSeller(p, sellerId)) {
      if (visit.date || visit.actual != null || visit.expected == null) continue;
      total += visit.expected;
    }
  }
  return total;
}

/** Month totals + tier/commission, sorted ascending by month. Confirmation-date patient counts
 * included. Pass sellerId to scope both to one seller — money follows visit-level attribution
 * (see visitsForSeller), while "patients confirmed" still follows current ownership since
 * that's a whole-patient pipeline event, not a per-visit one. */
export function computeMonthlyAggregates(
  patients: Patient[],
  settings: CommissionSettings,
  sellerId?: string
): MonthAggregate[] {
  const totals = computeMonthTotals(patients, sellerId);

  const patientCounts = new Map<string, number>();
  for (const p of patients) {
    if (sellerId != null && p.responsible_seller_id !== sellerId) continue;
    if (!p.confirmation_date) continue;
    const month = monthKey(p.confirmation_date);
    patientCounts.set(month, (patientCounts.get(month) ?? 0) + 1);
  }

  // Current month always included so a guaranteed fixed monthly payment still shows even with no activity yet.
  const months = new Set([...totals.keys(), ...patientCounts.keys(), currentMonthKey()]);

  const aggregates: MonthAggregate[] = [...months].map((month) => {
    const t = totals.get(month) ?? { month, actualTotal: 0, expectedTotal: 0 };
    const actualRate = rateForTotal(t.actualTotal, settings);
    const expectedRate = rateForTotal(t.expectedTotal, settings);
    return {
      month,
      actualTotal: t.actualTotal,
      expectedTotal: t.expectedTotal,
      actualRate,
      expectedRate,
      actualCommission: t.actualTotal * actualRate + settings.fixed_monthly_payment,
      expectedCommission: t.expectedTotal * expectedRate + settings.fixed_monthly_payment,
      patientCount: patientCounts.get(month) ?? 0,
    };
  });

  aggregates.sort((a, b) => a.month.localeCompare(b.month));
  return aggregates;
}

/** Each pound in a month is taxed at that month's flat rate, so a patient's
 * share of the month's commission is simply their payment × that month's rate.
 * Pass sellerId to get only the slice of this patient that seller gets credit for
 * (relevant once a patient has been reassigned partway through treatment). */
export function patientCommissionContribution(
  p: Patient,
  monthlyRates: Map<string, { actualRate: number; expectedRate: number }>,
  sellerId?: string
): { actual: number; expected: number } {
  let actual = 0;
  let expected = 0;

  for (const visit of visitsForSeller(p, sellerId)) {
    if (visit.actual != null) {
      if (!visit.date) continue;
      const rates = monthlyRates.get(monthKey(visit.date));
      if (rates) actual += visit.actual * rates.actualRate;
    } else if (visit.expected != null) {
      const month = visit.date ? monthKey(visit.date) : currentMonthKey();
      const rates = monthlyRates.get(month);
      if (rates) expected += visit.expected * rates.expectedRate;
    }
  }

  return { actual, expected };
}

/** Only meaningful the moment a payment is newly recorded — checks whether that specific
 * amount tipped this month's running total into a higher tier, which raises the rate on
 * every pound still to come this month, not just the one just paid. `patientsAfterSave`
 * must already reflect the new amount (i.e. fetched after the DB write it came from). */
export function detectTierJump(
  patientsAfterSave: Patient[],
  sellerId: string,
  settings: CommissionSettings,
  visitDate: string,
  newAmount: number
): Celebration | null {
  const month = monthKey(visitDate);
  const afterTotal = computeMonthTotals(patientsAfterSave, sellerId).get(month)?.actualTotal ?? 0;
  const beforeTotal = afterTotal - newAmount;
  const beforeRate = rateForTotal(beforeTotal, settings);
  const afterRate = rateForTotal(afterTotal, settings);
  if (afterRate <= beforeRate) return null;
  return { kind: "confetti", message: `🎉 You just hit the ${(afterRate * 100).toFixed(0)}% commission tier!` };
}

export function lastNMonths(n: number, endMonth: string = currentMonthKey()): string[] {
  const [year, month] = endMonth.split("-").map(Number);
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export function addMonths(monthKeyStr: string, n: number): string {
  const [year, month] = monthKeyStr.split("-").map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ratesMapFromAggregates(
  aggregates: MonthAggregate[]
): Map<string, { actualRate: number; expectedRate: number }> {
  const map = new Map<string, { actualRate: number; expectedRate: number }>();
  for (const a of aggregates) {
    map.set(a.month, { actualRate: a.actualRate, expectedRate: a.expectedRate });
  }
  return map;
}
