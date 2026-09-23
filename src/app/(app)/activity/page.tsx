import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { ActivityLogRow, describeActivity, formatActivityTime } from "@/lib/activity-log";
import {
  ACTIVITY_CATEGORY_ACTIONS,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_PAGE_SIZE,
  ActivityCategory,
  parseActivityCategory,
} from "@/lib/activity-categories";
import { Card } from "@/components/ui";

type Search = { actor?: string; category?: string; from?: string; to?: string; q?: string; page?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORT_ACTOR = "support";

/** The clinic's full activity history, for its admins — who changed what, when — with
 * filters. RLS (activity_log_select_admin) already limits this to admins of this clinic
 * (and to DentalSeller support inside the clinic). */
export default async function ActivityHistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") redirect("/");

  const params = await searchParams;
  const category = parseActivityCategory(params.category);
  const from = params.from && DATE_RE.test(params.from) ? params.from : "";
  const to = params.to && DATE_RE.test(params.to) ? params.to : "";
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at, via_support")
    .eq("clinic_id", viewer.clinicId)
    .order("created_at", { ascending: false })
    // one extra row tells us whether there's a next page
    .range((page - 1) * ACTIVITY_PAGE_SIZE, page * ACTIVITY_PAGE_SIZE);
  if (params.actor === SUPPORT_ACTOR) query = query.eq("via_support", true);
  else if (params.actor) query = query.eq("actor_id", params.actor).eq("via_support", false);
  if (category) query = query.in("action", ACTIVITY_CATEGORY_ACTIONS[category]);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lt("created_at", `${nextDay(to)}T00:00:00`);
  if (q) query = query.ilike("detail", `%${q.replace(/[%_]/g, "")}%`);

  const [{ data, error }, profiles, patients] = await Promise.all([query, getProfiles(supabase), getPatients(supabase)]);
  if (error) throw error;

  const rows = (data ?? []) as ActivityLogRow[];
  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  const entries = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name || "Unnamed seller"]));
  const patientNameById = new Map(patients.map((p) => [p.id, p.name]));

  const pageHref = (n: number) => {
    const sp = new URLSearchParams(Object.entries({ ...params, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `/activity?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Activity history</h1>
        <p className="mt-1 text-sm text-slate-500">Everything changed in your clinic, by whom and when. Only admins see this.</p>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" action="/activity">
          <select name="actor" defaultValue={params.actor ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm lg:col-span-1">
            <option value="">Everyone</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || "Unnamed seller"}
              </option>
            ))}
            <option value={SUPPORT_ACTOR}>DentalSeller support</option>
          </select>
          <select name="category" defaultValue={category ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All actions</option>
            {(Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityCategory[]).map((c) => (
              <option key={c} value={c}>
                {ACTIVITY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search details…"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Filter
            </button>
            <Link href="/activity" className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">No activity matches these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <p className="text-sm text-slate-800">{describeActivity(e, nameById, patientNameById)}</p>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatActivityTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="font-medium text-teal-700 hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-400">Page {page}</span>
          {hasMore ? (
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

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
