export type DashboardCardId =
  | "total_earned"
  | "total_commission"
  | "month_earnings"
  | "expected_earnings"
  | "patients_sold"
  | "confirmed_this_month"
  | "new_patients_delta"
  | "upcoming_visits_value"
  | "avg_commission_patient"
  | "avg_treatment_value"
  | "highest_value_patient";

/** Canonical set + labels, and the settings-page fallback order for cards not yet in a user's saved order. */
export const DASHBOARD_CARDS: { id: DashboardCardId; label: string }[] = [
  { id: "total_earned", label: "Total earned to date" },
  { id: "total_commission", label: "Total commission (earned + expected)" },
  { id: "month_earnings", label: "This month's earnings so far" },
  { id: "expected_earnings", label: "Total expected earnings" },
  { id: "patients_sold", label: "Total patients sold" },
  { id: "confirmed_this_month", label: "Patients sold this month" },
  { id: "new_patients_delta", label: "New patients vs last month" },
  { id: "upcoming_visits_value", label: "Upcoming visits value (30 days)" },
  { id: "avg_commission_patient", label: "Average commission per patient" },
  { id: "avg_treatment_value", label: "Average treatment value per patient" },
  { id: "highest_value_patient", label: "Highest-value patient this month" },
];

/** Cards eligible for the operational Dashboard — counts only, never a currency figure. */
export const OPERATIONAL_CARD_IDS: DashboardCardId[] = [
  "confirmed_this_month",
  "new_patients_delta",
  "patients_sold",
];

export const DEFAULT_OPERATIONAL_CARDS: DashboardCardId[] = ["confirmed_this_month", "new_patients_delta"];

/** Cards eligible for the Earnings page — everything commission/currency-denominated. */
export const EARNINGS_CARD_IDS: DashboardCardId[] = [
  "total_earned",
  "total_commission",
  "month_earnings",
  "expected_earnings",
  "upcoming_visits_value",
  "avg_commission_patient",
  "avg_treatment_value",
  "highest_value_patient",
];

export const DEFAULT_EARNINGS_CARDS: DashboardCardId[] = [
  "total_earned",
  "month_earnings",
  "expected_earnings",
  "total_commission",
];

/** New-user fallback for `settings.dashboard_cards` — the small default set for each page,
 * not "show everything". Existing users' already-saved (larger) selections are untouched. */
export const DEFAULT_DASHBOARD_CARDS: DashboardCardId[] = [...DEFAULT_OPERATIONAL_CARDS, ...DEFAULT_EARNINGS_CARDS];
