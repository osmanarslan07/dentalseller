import { Permission } from "@/types";

/** The sections of Clinic settings, one route each (/settings/clinic/<id>). Plain data, so the
 * menu, the section list, the search and the pages all read the same permissions — and a
 * section someone has no permission for is neither listed nor reachable. */
export type ClinicSectionId = "clinic" | "roles" | "money" | "operations" | "messaging" | "data";

export interface ClinicSection {
  id: ClinicSectionId;
  label: string;
  description: string;
  /** Any one of these lets someone in. */
  needs: Permission[];
}

export const CLINIC_SECTIONS: ClinicSection[] = [
  {
    id: "clinic",
    label: "Clinic",
    description: "Name, logo and contact details used on confirmation letters and quote offers.",
    needs: ["settings.branding"],
  },
  {
    id: "roles",
    label: "Team & roles",
    description: "What each role is allowed to do.",
    needs: ["roles.view", "roles.edit", "roles.delete"],
  },
  {
    id: "money",
    label: "Money",
    description: "Clinic-wide rules for how money is counted.",
    needs: ["settings.money"],
  },
  {
    id: "operations",
    label: "Operations",
    description: "Transfer companies, drivers and who is assigned by default.",
    needs: ["transfers.manage", "drivers.manage"],
  },
  {
    id: "messaging",
    label: "Messaging",
    description: "WhatsApp connection and driver messages, and the Telegram group.",
    needs: ["messaging.manage", "settings.telegram", "transfers.manage"],
  },
  {
    id: "data",
    label: "Data",
    description: "Download the clinic's records.",
    needs: ["patients.export"],
  },
];

export function clinicSectionHref(id: ClinicSectionId): string {
  return `/settings/clinic/${id}`;
}

export function getClinicSection(id: string): ClinicSection | undefined {
  return CLINIC_SECTIONS.find((s) => s.id === id);
}

export function visibleClinicSections(permissions: Permission[]): ClinicSection[] {
  return CLINIC_SECTIONS.filter((s) => s.needs.some((p) => permissions.includes(p)));
}

/** The section Clinic settings opens on: the first one the viewer may see. */
export function firstClinicSection(permissions: Permission[]): ClinicSection | undefined {
  return visibleClinicSections(permissions)[0];
}

/** Sections that moved to the Users page (step J); their old links land there. */
export const MOVED_SECTIONS: Record<string, string> = {
  users: "/users",
  sales: "/users?tab=sellers",
};

/** Every setting people look for, with the section it lives in. The settings search reads it. */
export const SETTINGS_INDEX: { label: string; section: ClinicSectionId; words?: string }[] = [
  { label: "Clinic name", section: "clinic", words: "full short brand" },
  { label: "Logo", section: "clinic", words: "image branding letterhead" },
  { label: "Address, phone and email", section: "clinic", words: "contact details letter quote offer" },
  { label: "Roles", section: "roles", words: "permissions what can do access" },
  { label: "Costs before commission", section: "money", words: "deduct hotel transfer cost" },
  { label: "Card payment surcharge", section: "money", words: "fee percent card payments" },
  { label: "Transfer companies", section: "operations", words: "taxi vehicle company" },
  { label: "Drivers", section: "operations", words: "driver phone" },
  { label: "Default drivers", section: "operations", words: "airport local assigned" },
  { label: "WhatsApp connection", section: "messaging", words: "whatsapp api token webhook meta" },
  { label: "Driver messages", section: "messaging", words: "template send automatic manual" },
  { label: "Telegram group", section: "messaging", words: "chat id notifications" },
  { label: "Export patients", section: "data", words: "csv download backup" },
];
