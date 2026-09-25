import { getSystemStatus, JobStatus, TelegramStatus } from "@/lib/platform";
import { JobHealth } from "@/lib/jobs";
import { formatActivityTime } from "@/lib/activity-log";
import { Badge, Card } from "@/components/ui";
import { getT } from "@/i18n/server";

const HEALTH: Record<JobHealth, { tone: "green" | "red" | "amber" | "slate"; label: string }> = {
  ok: { tone: "green", label: "Healthy" },
  failing: { tone: "red", label: "Last run failed" },
  overdue: { tone: "amber", label: "Overdue" },
  never: { tone: "amber", label: "No runs recorded" },
};

export default async function PlatformStatusPage() {
  const { jobs, telegram } = await getSystemStatus();
  const t = await getT();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("System status")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("Scheduled jobs and Telegram notifications, checked live when this page loads.")}
        </p>
      </div>

      <TelegramCard telegram={telegram} />

      <div className="grid gap-6 lg:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

async function JobCard({ job }: { job: JobStatus }) {
  const health = HEALTH[job.health];
  const t = await getT();
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{job.label}</h2>
        <Badge tone={health.tone}>{t(health.label)}</Badge>
      </div>
      <p className="mt-1 text-xs text-slate-500">{job.description}</p>
      <p className="mt-1 text-xs text-slate-400">{job.schedule}</p>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">{t("Last run")}</dt>
          <dd className="text-right tabular-nums text-slate-900">
            {job.lastRun ? formatActivityTime(job.lastRun.startedAt) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">{t("Last success")}</dt>
          <dd className="text-right tabular-nums text-slate-900">
            {job.lastSuccessAt ? formatActivityTime(job.lastSuccessAt) : "—"}
          </dd>
        </div>
      </dl>

      {job.health === "never" && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Nothing recorded since monitoring started. If this persists past its schedule, the job isn&apos;t being
          called{job.id === "task-reminders" ? " — check the cron-job.org setup." : "."}
        </p>
      )}
      {job.health === "failing" && job.lastRun?.error && (
        <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{job.lastRun.error}</p>
      )}

      {job.recentRuns.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("Recent runs")}</h3>
          <ul className="mt-2 space-y-1.5">
            {job.recentRuns.map((run) => (
              <li key={run.startedAt} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${run.ok ? "bg-emerald-500" : "bg-red-500"}`}
                  aria-label={run.ok ? "Succeeded" : "Failed"}
                />
                <span className="shrink-0 tabular-nums text-slate-500">{formatActivityTime(run.startedAt)}</span>
                <span className={`min-w-0 break-words ${run.ok ? "text-slate-600" : "text-red-600"}`}>
                  {run.ok ? (run.summary ?? "OK") : (run.error ?? `HTTP ${run.statusCode}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Check({ ok, warn = false, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: string | null }) {
  const color = ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-red-500";
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm text-slate-900">{label}</p>
        {detail && <p className="break-words text-xs text-slate-500">{detail}</p>}
      </div>
    </li>
  );
}

function TelegramCard({ telegram: t }: { telegram: TelegramStatus }) {
  const pending = t.pendingUpdates ?? 0;
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Telegram</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        <Check
          ok={t.tokenConfigured && t.botOk}
          label={t.botOk ? `Bot token valid (@${t.botUsername})` : t.tokenConfigured ? "Bot token rejected" : "Bot token not set"}
          detail={t.error}
        />
        <Check
          ok={!!t.webhookUrl}
          label={t.webhookUrl ? "Webhook registered" : "No webhook registered"}
          detail={t.webhookUrl ?? "Linking Telegram from Settings won't work until it is set."}
        />
        <Check
          ok={pending <= 20}
          warn={pending > 0}
          label={`${pending} update${pending === 1 ? "" : "s"} waiting`}
          detail={pending > 20 ? "Telegram can't deliver to the webhook — see the error below." : null}
        />
        <Check
          ok={!t.lastWebhookErrorAt}
          warn
          label={t.lastWebhookErrorAt ? `Last delivery error ${formatActivityTime(t.lastWebhookErrorAt)}` : "No recent delivery errors"}
          detail={t.lastWebhookError}
        />
        <Check ok={t.webhookSecretConfigured} label={t.webhookSecretConfigured ? "Webhook secret set" : "Webhook secret missing"} />
        <Check
          ok={t.fallbackChatConfigured}
          warn
          label={t.fallbackChatConfigured ? "Fallback chat set" : "No fallback chat"}
          detail={`TELEGRAM_CHAT_ID and TELEGRAM_GROUP_CHAT_ID go to ${t.envChatsClinicName ?? "no clinic"} only. Other clinics use their own group from Settings.`}
        />
      </ul>
    </Card>
  );
}
