import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPatientNames, getProfiles, getSellers } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { peopleNameMap } from "@/lib/sellers";
import { ActivityLogRow, activityActorName, describeActivity } from "@/lib/activity-log";
import { ACTIVITY_CATEGORY_ACTIONS, ACTIVITY_CATEGORY_LABELS, ActivityCategory } from "@/lib/activity-categories";
import { activityQuery, parseActivityFilters } from "@/lib/activity-filters";
import { escapeCsv } from "@/lib/csv";

/** The most rows one export holds; an export of the whole history in one go would be slow
 * and, for a big clinic, huge. Narrow the filters (dates) to export the rest. */
const EXPORT_LIMIT = 5000;

/** A cell that a spreadsheet would read as a formula gets a leading apostrophe. */
function safe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function categoryOf(action: string): string {
  const key = (Object.keys(ACTIVITY_CATEGORY_ACTIONS) as ActivityCategory[]).find((c) => ACTIVITY_CATEGORY_ACTIONS[c].includes(action));
  return key ? ACTIVITY_CATEGORY_LABELS[key] : "";
}

/** The activity history as a CSV, with the same filters as the Activity page. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "activity.view")) return new Response("Not allowed", { status: 403 });

  const filters = parseActivityFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const [{ data, error }, profiles, sellers] = await Promise.all([
    activityQuery(supabase, viewer.clinicId, filters).limit(EXPORT_LIMIT),
    getProfiles(supabase),
    getSellers(supabase),
  ]);
  if (error) return new Response("Could not load the activity", { status: 500 });

  const nameById = peopleNameMap(profiles, sellers);
  const rows = (data ?? []) as ActivityLogRow[];
  const patientNameById = await getPatientNames(supabase, rows.map((e) => e.target_id));

  const lines = [["Time (UTC)", "Person", "What happened", "Category"].join(",")];
  for (const e of rows) {
    const person = activityActorName(e, nameById);
    lines.push(
      [e.created_at.replace("T", " ").slice(0, 19), person, describeActivity(e, nameById, patientNameById), categoryOf(e.action)]
        .map((c) => escapeCsv(safe(c)))
        .join(",")
    );
  }

  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
