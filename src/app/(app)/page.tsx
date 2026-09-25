import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPatients, getProfiles, getSavedFilters, getSellers, getSettings } from "@/lib/data";
import { OPERATIONAL_CARD_IDS } from "@/lib/dashboard-cards";
import { getCoordinatorOptions, initialPeopleFilter } from "@/lib/coordinators";
import { ALL_FILTER } from "@/lib/people-filter";
import { DashboardClient } from "./DashboardClient";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";

type CountCardId = "patients_sold" | "confirmed_this_month" | "new_patients_delta";

export default async function DashboardPage() {
  const supabase = await createClient();
  // in support mode this is the member being viewed as — every "my …" view is theirs
  const viewer = await getViewer();
  const userId = viewer?.userId ?? "";
  // the count cards are for people who sell; transfers for people who book them
  const sells = can(viewer, "earnings.own");
  const booksTransfers = can(viewer, "transfers.manage");
  const [allPatients, settings, sellers, profiles, saved] = await Promise.all([
    getPatients(supabase),
    getSettings(supabase, userId),
    getSellers(supabase),
    getProfiles(supabase),
    getSavedFilters(supabase, userId),
  ]);
  const coordinators = viewer ? await getCoordinatorOptions(supabase, viewer.clinicId, profiles, allPatients) : [];
  // Default All / All (step K); a saved default wins. Everything filtered here is patient
  // counts and operational data — no commission — so any filter is safe to show.
  const initialFilter = initialPeopleFilter(
    {},
    saved.dashboard,
    new Set(sellers.map((s) => s.id)),
    new Set(coordinators.map((c) => c.id)),
    userId
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthAhead = new Date(today);
  monthAhead.setMonth(monthAhead.getMonth() + 1);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const monthAheadIso = `${monthAhead.getFullYear()}-${String(monthAhead.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(monthAhead.getDate()).padStart(2, "0")}`;

  const cardIds = settings.dashboard_cards.filter(
    (id): id is CountCardId => sells && OPERATIONAL_CARD_IDS.includes(id)
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <span className="flex items-center gap-1.5" title="Live data">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-600">Live</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Today&apos;s visits, follow-ups and logistics for the whole team.</p>
        {booksTransfers && (
        <Link
          href="/transfers"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100"
        >
          🚗 Today&apos;s &amp; tomorrow&apos;s transfers →
        </Link>
        )}
      </div>

      <DashboardClient
        allPatients={allPatients}
        sellers={sellers}
        coordinators={coordinators}
        cardIds={cardIds}
        initialFilter={initialFilter}
        savedFilter={saved.dashboard ?? ALL_FILTER}
        currentUserId={userId}
        currency={settings.currency}
        todayIso={todayIso}
        monthAheadIso={monthAheadIso}
      />
    </div>
  );
}
