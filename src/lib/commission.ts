import { CommissionSettings, Patient } from "@/types";
import { formatCurrency } from "@/lib/format";

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // 'YYYY-MM'
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
}

function patientVisits(p: Patient): Visit[] {
  return [
    {
      date: p.visit1_date,
      expected: p.visit1_expected,
      actual: p.visit1_actual,
      status: p.visit1_status,
    },
    {
      date: p.visit2_date,
      expected: p.visit2_expected,
      actual: p.visit2_actual,
      status: p.visit2_status,
    },
    ...p.extra_visits.map((v) => ({
      date: v.visit_date,
      expected: v.expected,
      actual: v.actual,
      status: v.status,
    })),
  ];
}

/** Raw actual/expected totals per calendar month across all patients. */
export function computeMonthTotals(patients: Patient[]): Map<string, MonthTotals> {
  const map = new Map<string, MonthTotals>();

  const bump = (month: string, key: "actualTotal" | "expectedTotal", amount: number) => {
    const existing = map.get(month) ?? { month, actualTotal: 0, expectedTotal: 0 };
    existing[key] += amount;
    map.set(month, existing);
  };

  for (const p of patients) {
    for (const visit of patientVisits(p)) {
      if (!visit.date) continue;
      const month = monthKey(visit.date);
      if (visit.actual != null) bump(month, "actualTotal", visit.actual);
      if (visit.expected != null && visit.status !== "completed") bump(month, "expectedTotal", visit.expected);
    }
  }

  return map;
}

/** Month totals + tier/commission, sorted ascending by month. Confirmation-date patient counts included. */
export function computeMonthlyAggregates(
  patients: Patient[],
  settings: CommissionSettings
): MonthAggregate[] {
  const totals = computeMonthTotals(patients);

  const patientCounts = new Map<string, number>();
  for (const p of patients) {
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
 * share of the month's commission is simply their payment × that month's rate. */
export function patientCommissionContribution(
  p: Patient,
  monthlyRates: Map<string, { actualRate: number; expectedRate: number }>
): { actual: number; expected: number } {
  let actual = 0;
  let expected = 0;

  for (const visit of patientVisits(p)) {
    if (!visit.date) continue;
    const rates = monthlyRates.get(monthKey(visit.date));
    if (!rates) continue;
    if (visit.actual != null) actual += visit.actual * rates.actualRate;
    if (visit.expected != null && visit.status !== "completed") expected += visit.expected * rates.expectedRate;
  }

  return { actual, expected };
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
