/** Groups the activity_log action names into the filters shown on history pages. */

export type ActivityCategory = "patients" | "money" | "transfers" | "quotes" | "tasks" | "team" | "roles" | "settings";

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  patients: "Patients & visits",
  money: "Payments, discounts & extras",
  transfers: "Transfers & drivers",
  quotes: "Quotes",
  tasks: "Tasks",
  team: "Team",
  roles: "Roles & permissions",
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
    "file_uploaded",
    "file_renamed",
    "file_deleted",
    "transfer_added",
    "transfer_updated",
    "transfer_deleted",
    "transfer_sent",
  ],
  money: [
    "payment_added",
    "payment_updated",
    "payment_deleted",
    "discount_set",
    "discount_removed",
    "extra_added",
    "extra_updated",
    "extra_deleted",
    "deal_currency_updated",
  ],
  transfers: [
    "transfer_company_added",
    "transfer_company_updated",
    "transfer_company_deleted",
    "transfer_defaults_updated",
    "driver_messages_updated",
    "driver_added",
    "driver_updated",
    "driver_deleted",
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
    "member_profile_updated",
    "coordinator_handover",
    "seller_record_added",
    "seller_record_renamed",
    "seller_record_activated",
    "seller_record_deactivated",
    "seller_record_deleted",
    "seller_record_merged",
    "seller_commission_updated",
    "seller_currency_updated",
  ],
  roles: [
    "member_roles_changed",
    "role_created",
    "role_changed",
    "role_reset",
    "role_deleted",
  ],
  settings: [
    "commission_settings_updated",
    "clinic_branding_updated",
    "system_settings_updated",
    "dashboard_cards_updated",
    "telegram_group_chat_updated",
    "terms_accepted",
    "display_name_updated",
    "password_changed",
    "phone_updated",
    "email_changed",
    "avatar_updated",
    "avatar_removed",
    "telegram_link_generated",
    "telegram_linked",
  ],
};

export function parseActivityCategory(value: string | undefined): ActivityCategory | null {
  return value && value in ACTIVITY_CATEGORY_LABELS ? (value as ActivityCategory) : null;
}

export const ACTIVITY_PAGE_SIZE = 50;
