/** The scheduled jobs the system status page watches. Pure config — keep in step with
 * vercel.json (Vercel-scheduled) and the external cron-job.org setup (task reminders, which
 * the Hobby plan can't schedule more often than daily). */

export type JobId = "exchange-rate" | "visit-reminders" | "task-reminders";

export interface JobDefinition {
  id: JobId;
  label: string;
  description: string;
  schedule: string;
  /** A job with no successful run within this long is flagged overdue. */
  expectedEveryHours: number;
}

export const JOBS: JobDefinition[] = [
  {
    id: "task-reminders",
    label: "Task reminders",
    description: "Sends due task reminders to Telegram.",
    schedule: "External (cron-job.org), expected at least hourly",
    expectedEveryHours: 1,
  },
  {
    id: "visit-reminders",
    label: "Visit reminders",
    description: "Sends tomorrow's and next week's arrivals, departures and visits to Telegram.",
    schedule: "Daily at 08:00 UTC (vercel.json)",
    expectedEveryHours: 24,
  },
  {
    id: "exchange-rate",
    label: "Exchange rates",
    description: "Saves today's market rates (EUR → every supported currency; any pair is crossed through EUR).",
    schedule: "Daily at 06:00 UTC (vercel.json)",
    expectedEveryHours: 24,
  },
];

/** Room for a late start or one slow run before "overdue" fires. */
const GRACE_HOURS = 2;

export type JobHealth = "ok" | "failing" | "overdue" | "never";

export function jobHealth(
  job: JobDefinition,
  lastRun: { ok: boolean; startedAt: string } | null,
  lastSuccessAt: string | null,
  now = Date.now()
): JobHealth {
  if (!lastRun) return "never";
  if (!lastRun.ok) return "failing";
  const allowedMs = (job.expectedEveryHours + GRACE_HOURS) * 3600_000;
  if (!lastSuccessAt || now - Date.parse(lastSuccessAt) > allowedMs) return "overdue";
  return "ok";
}
