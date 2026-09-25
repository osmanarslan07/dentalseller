import { msg } from "@/i18n";
import { ClinicModule, Permission } from "@/types";

/** How the Roles page, "What I can do" and the member view show the permission catalog. The
 * database (supabase/schema.sql → permissions) is what counts; this only labels and groups it.
 * Every non-legacy key in the database should appear here exactly once. */
export interface PermissionInfo {
  key: Permission;
  label: string;
  /** The part of the product it belongs to — greyed out when the clinic doesn't have it. */
  module: ClinicModule | null;
}

export interface PermissionGroup {
  label: string;
  permissions: PermissionInfo[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: msg("Patients"),
    permissions: [
      { key: "patients.view", label: msg("See patients, visits and the calendar"), module: null },
      { key: "patients.edit", label: msg("Add and edit patients, visits and travel"), module: null },
      { key: "patients.delete", label: msg("Delete any patient (a seller can always delete their own)"), module: null },
      { key: "patients.export", label: msg("Export patients to a CSV file"), module: null },
    ],
  },
  {
    label: msg("Sellers"),
    permissions: [
      { key: "sellers.assign", label: msg("Record a patient for any seller, type a new seller, reassign any patient"), module: null },
      { key: "sellers.manage", label: msg("Manage the seller list and sellers' commission rates"), module: null },
    ],
  },
  {
    label: msg("Money"),
    permissions: [
      { key: "money.edit", label: msg("Change prices, extras and discounts"), module: null },
      { key: "payments.record", label: msg("Record new payments"), module: null },
      { key: "payments.edit", label: msg("Edit and delete payments"), module: null },
    ],
  },
  {
    label: msg("Patient files"),
    permissions: [
      { key: "files.view", label: msg("See and open patient files"), module: null },
      { key: "files.manage", label: msg("Upload files; rename and delete their own"), module: null },
      { key: "files.delete", label: msg("Rename and delete anyone's files"), module: null },
    ],
  },
  {
    label: msg("Transfers"),
    permissions: [
      { key: "transfers.manage", label: msg("Transfers page; book transfers and hotels; add and edit drivers"), module: "operations" },
      { key: "drivers.manage", label: msg("Delete drivers and companies; default drivers for new transfers"), module: "operations" },
      { key: "messaging.manage", label: msg("Driver messages: WhatsApp app / Business API / off"), module: "operations" },
    ],
  },
  {
    label: msg("Sales"),
    permissions: [
      { key: "quotes.use", label: msg("Make and send quotes"), module: "sales" },
      { key: "earnings.own", label: msg("See their own commission"), module: "sales" },
      { key: "earnings.all", label: msg("See every seller's earnings (Sales performance)"), module: "sales" },
    ],
  },
  {
    label: msg("Accounting"),
    permissions: [{ key: "accounting.view", label: msg("Accounting page"), module: "accounting" }],
  },
  {
    label: msg("Tasks"),
    permissions: [{ key: "tasks.use", label: msg("Tasks"), module: null }],
  },
  {
    label: msg("Team"),
    permissions: [
      { key: "team.view", label: msg("See the team list in Settings, with emails"), module: null },
      { key: "team.manage", label: msg("Add members, change their roles, deactivate, reset passwords"), module: null },
      { key: "team.delete", label: msg("Delete members' accounts"), module: null },
      { key: "activity.view", label: msg("Activity log"), module: null },
    ],
  },
  {
    label: msg("Roles"),
    permissions: [
      { key: "roles.view", label: msg("See what every role can do"), module: null },
      { key: "roles.edit", label: msg("Create roles and change what roles can do"), module: null },
      { key: "roles.delete", label: msg("Delete custom roles"), module: null },
    ],
  },
  {
    label: msg("Clinic settings"),
    permissions: [
      { key: "settings.branding", label: msg("Branding on confirmation letters and quotes"), module: null },
      { key: "settings.telegram", label: msg("Team Telegram group"), module: null },
      { key: "settings.money", label: msg("Money rules: costs before commission, card surcharge"), module: null },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionInfo[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

const INFO_BY_KEY = new Map(ALL_PERMISSIONS.map((p) => [p.key, p]));

export function permissionLabel(key: string): string {
  return INFO_BY_KEY.get(key as Permission)?.label ?? key;
}

/** Only keys a role can be given (drops legacy / unknown ones). */
export function grantablePermissions(keys: string[]): Permission[] {
  return ALL_PERMISSIONS.filter((p) => keys.includes(p.key)).map((p) => p.key);
}

/** The keys a module-less clinic can't use right now. */
export function isOffForModules(info: PermissionInfo, modules: ClinicModule[]): boolean {
  return !!info.module && !modules.includes(info.module);
}
