import { DateInput } from "@/components/DateInput";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClinicWithStats, getMaskedClinicActivity } from "@/lib/platform";
import { ACTIVITY_CATEGORY_LABELS, ActivityCategory, parseActivityCategory } from "@/lib/activity-categories";
import { formatActivityTime } from "@/lib/activity-log";
import { Badge, Card } from "@/components/ui";
import { SupportModeButton } from "../SupportModeButton";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Search = { actor?: string; category?: string; from?: string; to?: string; page?: string };

/** A clinic's own history, de-identified: staff, actions, fields and non-identifying values,
 * with patients/quotes/tasks as references. Names are one step away in support mode. */
export default async function ClinicActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;

  const category = parseActivityCategory(sp.category);
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : "";
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : "";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  const [clinic, activity] = await Promise.all([
    getClinicWithStats(id),
    getMaskedClinicActivity(id, { actor: sp.actor, category, from, to, page }),
  ]);
  if (!clinic) notFound();

  const base = `/platform/clinics/${id}/activity`;
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/platform/clinics/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← {clinic.name}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Clinic activity</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Who did what and when. Patient names and free-text details are hidden here; patients, quotes and tasks
            show as references like #P-7F3A. To see the full details, open the clinic in support mode (your visit is
            logged).
          </p>
        </div>
        <SupportModeButton clinicId={id} />
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" action={base}>
          <select name="actor" defaultValue={sp.actor ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Everyone</option>
            {activity.staff.map(([staffId, name]) => (
              <option key={staffId} value={staffId}>
                {name}
              </option>
            ))}
            <option value="support">DentalSeller support</option>
          </select>
          <select name="category" defaultValue={category ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All actions</option>
            {(Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityCategory[]).map((c) => (
              <option key={c} value={c}>
                {ACTIVITY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <DateInput name="from" defaultValue={from} aria-label="From" className="w-40" />
          <DateInput name="to" defaultValue={to} aria-label="To" className="w-40" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Filter
            </button>
            <Link href={base} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {activity.entries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">No activity matches these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <p className="text-sm text-slate-800">
                  {e.viaSupport && (
                    <span className="mr-2">
                      <Badge tone="blue">Support</Badge>
                    </span>
                  )}
                  {e.text}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatActivityTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(page > 1 || activity.hasMore) && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="font-medium text-teal-700 hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-400">Page {page}</span>
          {activity.hasMore ? (
            <Link href={pageHref(page + 1)} className="font-medium text-teal-700 hover:underline">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
