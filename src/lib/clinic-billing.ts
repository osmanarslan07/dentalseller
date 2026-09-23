/** Per-clinic plan & billing record (clinic_billing). Pure helpers only — record-keeping,
 * no payments. Readable by superadmins alone; a clinic never sees its own row. */

export type Plan = "trial" | "starter" | "pro" | "custom";

export const PLANS: Plan[] = ["trial", "starter", "pro", "custom"];

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  starter: "Starter",
  pro: "Pro",
  custom: "Custom",
};

export const BILLING_CURRENCIES = ["EUR", "GBP", "USD", "TRY"] as const;

export interface ClinicBilling {
  plan: Plan;
  /** Max active accounts (admins + sellers); null = unlimited. */
  seatLimit: number | null;
  /** ISO date, only meaningful on the trial plan. */
  trialEndsAt: string | null;
  monthlyPrice: number | null;
  currency: string;
  notes: string | null;
}

export const TRIAL_WARNING_DAYS = 7;

export type TrialStatus = { kind: "none" } | { kind: "active"; daysLeft: number } | { kind: "expired"; daysAgo: number };

/** Days are whole calendar days in UTC, so "ends today" is 0 days left, not expired. */
export function trialStatus(billing: ClinicBilling | null, now = Date.now()): TrialStatus {
  if (!billing || billing.plan !== "trial" || !billing.trialEndsAt) return { kind: "none" };
  const dayMs = 24 * 60 * 60 * 1000;
  const today = Math.floor(now / dayMs);
  const end = Math.floor(Date.parse(`${billing.trialEndsAt}T00:00:00Z`) / dayMs);
  return end >= today ? { kind: "active", daysLeft: end - today } : { kind: "expired", daysAgo: today - end };
}

/** True when adding one more active account would exceed the plan's seat limit. */
export function seatsFull(billing: ClinicBilling | null, activeAccounts: number): boolean {
  return !!billing?.seatLimit && activeAccounts >= billing.seatLimit;
}

/** "€99" / "€99.50" — prices keep their cents, unlike formatCurrency (whole units, for commission). */
export function formatPrice(value: number, currency: string): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
