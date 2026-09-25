import { DateInput } from "@/components/DateInput";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSellers } from "@/lib/data";
import { peopleNameMap } from "@/lib/sellers";
import { requirePagePermission } from "@/lib/permissions";
import { ActivityLogRow, describeActivity, formatActivityTime } from "@/lib/activity-log";
import { ACTIVITY_CATEGORY_LABELS, ACTIVITY_PAGE_SIZE, ActivityCategory } from "@/lib/activity-categories";
import { SUPPORT_ACTOR, activityQuery, parseActivityFilters } from "@/lib/activity-filters";
import { Card } from "@/components/ui";
import { getT } from "@/i18n/server";

type Search = { actor?: string; category?: string; patient?: string; from?: string; to?: string; q?: string; page?: string };

/** The clinic's full activity history, for its admins — who changed what, when — with
 * filters. RLS (activity_log_select_admin) already limits this to admins of this clinic
 * (and to DentalSeller support inside the clinic). */
export default async function ActivityHistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requirePagePermission("activity.view");
  const t = await getT();

  const params = await searchParams;
  const { category, from, to, q, actor, patient } = parseActivityFilters(params);
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const supabase = await createClient();
  // one extra row tells us whether there's a next page
  const query = activityQuery(supabase, viewer.clinicId, { actor, category, patient, from, to, q }).range(
    (page - 1) * ACTIVITY_PAGE_SIZE,
    page * ACTIVITY_PAGE_SIZE
  );

  const [{ data, error }, profiles, patients, sellers] = await Promise.all([
    query,
    getProfiles(supabase),
    getPatients(supabase),
    getSellers(supabase),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as ActivityLogRow[];
  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  const entries = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const nameById = peopleNameMap(profiles, sellers);
  const patientNameById = new Map(patients.map((p) => [p.id, p.name]));

  const filterParams = new URLSearchParams(
    Object.entries({ actor, category: category ?? "", patient, from, to, q }).filter(([, v]) => v) as [string, string][]
  );
  const pageHref = (n: number) => {
    const sp = new URLSearchParams(filterParams);
    sp.set("page", String(n));
    return `/activity?${sp.toString()}`;
  };
  const exportHref = `/activity/export${filterParams.size ? `?${filterParams.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("Activity")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Everything changed in your clinic, by whom and when. Only people whose role allows it see this.")}</p>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" action="/activity">
          <select name="actor" defaultValue={actor} aria-label={t("Person")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm lg:col-span-1">
            <option value="">{t("Everyone")}</option>
            {/* someone who never signed in has done nothing to filter by */}
            {profiles
              .filter((p) => p.display_name || p.id === actor)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || t("Unnamed seller")}
                </option>
              ))}
            <option value={SUPPORT_ACTOR}>{t("DentalSeller support")}</option>
          </select>
          <select name="category" defaultValue={category ?? ""} aria-label={t("Category")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">{t("All actions")}</option>
            {(Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityCategory[]).map((c) => (
              <option key={c} value={c}>
                {t(ACTIVITY_CATEGORY_LABELS[c])}
              </option>
            ))}
          </select>
          <select name="patient" defaultValue={patient} aria-label={t("Patient")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">{t("All patients")}</option>
            {[...patients]
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <DateInput name="from" defaultValue={from} aria-label={t("From")} className="w-40" />
          <DateInput name="to" defaultValue={to} aria-label={t("To")} className="w-40" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("Search details…")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              {t("Filter")}
            </button>
            <Link href="/activity" className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
              {t("Reset")}
            </Link>
            <a href={exportHref} className="rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">
              CSV
            </a>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">{t("No activity matches these filters.")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <p className="text-sm text-slate-800">{describeActivity(e, nameById, patientNameById, t)}</p>
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
              ← {t("Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-400">{t("Page {n}", { n: page })}</span>
          {hasMore ? (
            <Link href={pageHref(page + 1)} className="font-medium text-teal-700 hover:underline">
              {t("Older")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
