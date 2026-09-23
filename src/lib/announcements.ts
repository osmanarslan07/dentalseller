/** Platform-wide banners shown at the top of the clinic app. Pure types/helpers — the RLS
 * policy on `announcements` decides who sees what; this only describes and labels them. */

export type AnnouncementLevel = "info" | "warning" | "critical";

export const ANNOUNCEMENT_LEVELS: AnnouncementLevel[] = ["info", "warning", "critical"];

export const ANNOUNCEMENT_LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export const ANNOUNCEMENT_MAX_LENGTH = 500;

/** What the clinic app needs to render a banner. */
export interface LiveAnnouncement {
  id: string;
  message: string;
  level: AnnouncementLevel;
}

/** The platform area's full view of one announcement. */
export interface Announcement extends LiveAnnouncement {
  /** null = every clinic */
  clinicIds: string[] | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export type AnnouncementStatus = "scheduled" | "live" | "ended";

export function announcementStatus(a: Pick<Announcement, "startsAt" | "endsAt">, now = Date.now()): AnnouncementStatus {
  if (Date.parse(a.startsAt) > now) return "scheduled";
  if (a.endsAt && Date.parse(a.endsAt) <= now) return "ended";
  return "live";
}

/** Critical banners can't be dismissed — they're for things people must not miss. */
export function isDismissible(level: AnnouncementLevel): boolean {
  return level !== "critical";
}
