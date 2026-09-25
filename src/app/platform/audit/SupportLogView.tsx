import { DateInput } from "@/components/DateInput";
import Link from "next/link";
import { getSupportLog, SUPPORT_LOG_LIMIT } from "@/lib/platform";
import { formatActivityTime } from "@/lib/activity-log";
import { Badge, Card } from "@/components/ui";
import { getT } from "@/i18n/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EVENT_LABELS: Record<string, string> = {
  session_started: "Entered clinic",
  session_ended: "Left clinic",
  session_extended: "Extended session",
  editing_unlocked: "Unlocked editing",
  editing_locked: "Locked editing",
  view_as_changed: "Viewing as",
  page_viewed: "Opened",
  record_history_viewed: "Viewed history of",
  record_file_opened: "Opened a file of",
  change_made: "Changed",
};

const EVENT_TONES: Record<string, "slate" | "green" | "amber" | "blue" | "red"> = {
  session_started: "green",
  session_ended: "slate",
  editing_unlocked: "amber",
  change_made: "red",
  record_history_viewed: "blue",
  record_file_opened: "blue",
};

/** The support access log: every support session, what was opened and what was changed —
 * tamper-evident (hash-chained), exportable for a clinic, a lawyer or a court. Superadmin
 * panel only; clinics never see it. */
export async function SupportLogView({ clinic, from, to }: { clinic?: string; from?: string; to?: string }) {
  const f = {
    clinicId: clinic || undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
  };
  const log = await getSupportLog(f);
  const t = await getT();
  const exportQuery = new URLSearchParams(
    Object.entries({ clinic: f.clinicId, from: f.from, to: f.to }).filter(([, v]) => v) as [string, string][]
  ).toString();

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" action="/platform/audit">
          <input type="hidden" name="tab" value="support" />
          <select name="clinic" defaultValue={f.clinicId ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm lg:col-span-2">
            <option value="">{t("All clinics")}</option>
            {log.clinics.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <DateInput name="from" defaultValue={f.from ?? ""} aria-label={t("From")} className="w-40" />
          <DateInput name="to" defaultValue={f.to ?? ""} aria-label={t("To")} className="w-40" />
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            {t("Filter")}
          </button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {log.integrity.brokenId === null ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("Log intact — all {n} entries verified against the hash chain.", { n: log.integrity.checked })}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {t("Integrity check failed at entry #{id}: the log was altered from that point.", { id: log.integrity.brokenId })}
          </p>
        )}
        <a
          href={`/platform/audit/support-export${exportQuery ? `?${exportQuery}` : ""}`}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          {t("Export CSV")}{f.clinicId ? ` (${t("this clinic")})` : ""}
        </a>
      </div>

      {log.sessions.length === 0 ? (
        <Card className="px-5 py-12 text-center text-sm text-slate-400">{t("No support activity matches these filters.")}</Card>
      ) : (
        log.sessions.map((s) => (
          <Card key={s.sessionId ?? s.events[0]?.id} className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <div>
                <span className="font-medium text-slate-900">{s.clinicName}</span>
                <span className="ml-2 text-sm text-slate-500">{t("by {name}", { name: s.superadminName })}</span>
              </div>
              <span className="text-xs tabular-nums text-slate-400">
                {formatActivityTime(s.startedAt)} → {formatActivityTime(s.lastAt)}
                {s.clinicId && (
                  <>
                    {" · "}
                    <Link href={`/platform/clinics/${s.clinicId}/activity?actor=support`} className="text-teal-700 hover:underline">
                      {t("changes in clinic history")}
                    </Link>
                  </>
                )}
              </span>
            </div>
            <ul className="divide-y divide-slate-50">
              {s.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-2 text-sm">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-slate-400">{formatActivityTime(e.createdAt)}</span>
                  <Badge tone={EVENT_TONES[e.event] ?? "slate"}>{t(EVENT_LABELS[e.event] ?? e.event)}</Badge>
                  <span className="min-w-0 break-all text-slate-700">{e.path ?? e.detail ?? ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      {log.truncated && (
        <p className="text-xs text-slate-400">
          {t("Showing the latest {n} entries. Narrow the filters, or export, to see everything.", { n: SUPPORT_LOG_LIMIT })}
        </p>
      )}
    </div>
  );
}
