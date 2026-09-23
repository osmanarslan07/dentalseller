/** Groups the activity_log action names into the filters shown on history pages. */

export type ActivityCategory = "patients" | "quotes" | "tasks" | "team" | "settings";

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  patients: "Patients & visits",
  quotes: "Quotes",
  tasks: "Tasks",
  team: "Team",
  settings: "Settings & account",
};

export const ACTIVITY_CATEGORY_ACTIONS: Record<ActivityCategory, string[]> = {
  patients: [
    "patient_created",
    "patient_updated",
    "patient_deleted",
    "patient_reassigned",
    "patient_logistics_toggled",
    "patient_telegram_sent",
    "visit_added",
    "visit_updated",
    "visit_deleted",
    "visit_logistics_toggled",
  ],
  quotes: ["quote_created", "quote_updated", "quote_duplicated", "quote_deleted", "quote_converted"],
  tasks: ["task_created", "task_updated", "task_status_changed", "task_deleted"],
  team: [
    "seller_added",
    "seller_activated",
    "seller_deactivated",
    "seller_promoted",
    "seller_demoted",
    "seller_deleted",
    "password_reset",
  ],
  settings: [
    "commission_settings_updated",
    "clinic_branding_updated",
    "dashboard_cards_updated",
    "telegram_group_chat_updated",
    "terms_accepted",
    "display_name_updated",
    "password_changed",
    "telegram_link_generated",
  ],
};

export function parseActivityCategory(value: string | undefined): ActivityCategory | null {
  return value && value in ACTIVITY_CATEGORY_LABELS ? (value as ActivityCategory) : null;
}

export const ACTIVITY_PAGE_SIZE = 50;
