import { Patient } from "@/types";

/** The Seller + Coordinator filters shared by the patients list, dashboard, calendar and
 * transfers. They decide *which patients* a page shows — never whose money: commission shown
 * anywhere is still only the viewer's own. Plain data and functions, so the pages, the
 * filter bar and the saved-default action all agree on what a value means. */

export type FilterPage = "patients" | "dashboard" | "calendar" | "transfers";
export const FILTER_PAGES: FilterPage[] = ["patients", "dashboard", "calendar", "transfers"];

export interface PeopleFilter {
  /** "all", "me", or a seller's id (accounts and sellers without one). */
  seller: string;
  /** "all", "me", "none" (no coordinator), or a member's id. */
  coordinator: string;
}

export type SavedFilters = Partial<Record<FilterPage, PeopleFilter>>;

export const ALL_FILTER: PeopleFilter = { seller: "all", coordinator: "all" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanValue(value: unknown, allowNone: boolean): string {
  if (value === "all" || value === "me" || (allowNone && value === "none")) return value;
  return typeof value === "string" && UUID_RE.test(value) ? value : "all";
}

/** Anything from the client or the database, made into a valid filter (unknown → All). */
export function cleanPeopleFilter(raw: unknown): PeopleFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { seller: cleanValue(r.seller, false), coordinator: cleanValue(r.coordinator, true) };
}

export function parseSavedFilters(raw: unknown): SavedFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: SavedFilters = {};
  for (const page of FILTER_PAGES) if (r[page]) out[page] = cleanPeopleFilter(r[page]);
  return out;
}

export function isAllFilter(f: PeopleFilter): boolean {
  return f.seller === "all" && f.coordinator === "all";
}

export function sameFilter(a: PeopleFilter, b: PeopleFilter): boolean {
  return a.seller === b.seller && a.coordinator === b.coordinator;
}

/** A saved filter naming someone who is no longer offered (deleted, merged) falls back to All
 * for that half, so a stale default never silently empties a page. */
export function resolveFilter(
  saved: PeopleFilter | undefined,
  sellerIds: Set<string>,
  coordinatorIds: Set<string>
): PeopleFilter {
  if (!saved) return ALL_FILTER;
  const known = (v: string, ids: Set<string>) => (v === "all" || v === "me" || v === "none" || ids.has(v) ? v : "all");
  return { seller: known(saved.seller, sellerIds), coordinator: known(saved.coordinator, coordinatorIds) };
}

export function matchesPeopleFilter(
  p: Pick<Patient, "responsible_seller_id" | "coordinator_id">,
  f: PeopleFilter,
  me: string
): boolean {
  if (f.seller !== "all" && p.responsible_seller_id !== (f.seller === "me" ? me : f.seller)) return false;
  if (f.coordinator === "none") return p.coordinator_id == null;
  if (f.coordinator !== "all" && p.coordinator_id !== (f.coordinator === "me" ? me : f.coordinator)) return false;
  return true;
}

/** Still has a visit to come: an active patient for whoever follows them up. */
export function hasVisitToCome(p: {
  visit1_status: string;
  visit2_status: string;
  needs_visit2: boolean;
  extra_visits?: { status: string }[] | null;
}): boolean {
  return (
    p.visit1_status === "upcoming" ||
    (p.needs_visit2 && p.visit2_status === "upcoming") ||
    (p.extra_visits ?? []).some((v) => v.status === "upcoming")
  );
}

/** The patients list, filtered to one coordinator's patients with a visit still to come —
 * exactly what the workload card's "Active patients" number counts. */
export function patientsHrefForCoordinator(id: string): string {
  return `/patients?coordinator=${id}&active=1`;
}
