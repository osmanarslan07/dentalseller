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
  { id: "confirmed_this_month", label: "Confirmed this month" },
  { id: "new_patients_delta", label: "New patients vs last month" },
  { id: "upcoming_visits_value", label: "Upcoming visits value (30 days)" },
  { id: "avg_commission_patient", label: "Average commission per patient" },
  { id: "avg_treatment_value", label: "Average treatment value per patient" },
  { id: "highest_value_patient", label: "Highest-value patient this month" },
];

export const DEFAULT_DASHBOARD_CARDS: DashboardCardId[] = DASHBOARD_CARDS.map((c) => c.id);
