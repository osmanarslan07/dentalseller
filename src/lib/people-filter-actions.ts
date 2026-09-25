"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActingUser } from "@/lib/viewer";
import { FILTER_PAGES, FilterPage, PeopleFilter, cleanPeopleFilter, parseSavedFilters } from "@/lib/people-filter";

const PAGE_PATHS: Record<FilterPage, string> = {
  patients: "/patients",
  dashboard: "/",
  calendar: "/calendar",
  transfers: "/transfers",
};

/** Saves (or, with null, clears) the viewer's own default filter for one page. On their own
 * settings row, so RLS keeps it theirs; support can only do this while editing is unlocked. */
export async function saveMyDefaultFilter(page: FilterPage, filter: PeopleFilter | null): Promise<void> {
  if (!FILTER_PAGES.includes(page)) throw new Error("Unknown page");
  const supabase = await createClient();
  const user = await getActingUser();

  const { data: row, error: readError } = await supabase
    .from("settings")
    .select("saved_filters")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const saved = parseSavedFilters(row?.saved_filters);
  if (filter) saved[page] = cleanPeopleFilter(filter);
  else delete saved[page];

  const { error } = await supabase.from("settings").upsert({ user_id: user.id, saved_filters: saved });
  if (error) throw new Error(error.message);

  revalidatePath(PAGE_PATHS[page]);
}
