import { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_CATEGORY_ACTIONS, ActivityCategory, parseActivityCategory } from "@/lib/activity-categories";

/** The filters of the clinic activity history. They live in the URL (so a view can be shared
 * and paged) and are parsed here once, so the page, the CSV export and any pre-filtered
 * feed (a user's page, a patient's History) agree on what a filter means. */
export const SUPPORT_ACTOR = "support";

export interface ActivityFilters {
  /** A member's id, or SUPPORT_ACTOR for what DentalSeller support did. */
  actor: string;
  category: ActivityCategory | null;
  /** A patient's id: everything recorded about that patient. */
  patient: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  /** Free text searched in the entry's details. */
  q: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseActivityFilters(params: Record<string, string | undefined>): ActivityFilters {
  const actor = params.actor === SUPPORT_ACTOR || (params.actor && UUID_RE.test(params.actor)) ? params.actor! : "";
  return {
    actor,
    category: parseActivityCategory(params.category),
    patient: params.patient && UUID_RE.test(params.patient) ? params.patient : "",
    from: params.from && DATE_RE.test(params.from) ? params.from : "",
    to: params.to && DATE_RE.test(params.to) ? params.to : "",
    q: (params.q ?? "").trim().slice(0, 100),
  };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The clinic's activity, newest first, narrowed by the filters. The caller adds the paging
 * (.range / .limit). RLS still decides who may read any of it. */
export function activityQuery(supabase: SupabaseClient, clinicId: string, f: ActivityFilters) {
  let query = supabase
    .from("activity_log")
    .select("id, actor_id, action, target_type, target_id, detail, created_at, via_support, former_actor_id")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  if (f.actor === SUPPORT_ACTOR) query = query.eq("via_support", true);
  // a deleted account's entries carry its id in former_actor_id (f.actor is a checked uuid)
  else if (f.actor) query = query.or(`actor_id.eq.${f.actor},former_actor_id.eq.${f.actor}`).eq("via_support", false);
  if (f.category) query = query.in("action", ACTIVITY_CATEGORY_ACTIONS[f.category]);
  if (f.patient) query = query.eq("target_type", "patient").eq("target_id", f.patient);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00`);
  if (f.to) query = query.lt("created_at", `${nextDay(f.to)}T00:00:00`);
  if (f.q) query = query.ilike("detail", `%${f.q.replace(/[%_]/g, "")}%`);
  return query;
}
