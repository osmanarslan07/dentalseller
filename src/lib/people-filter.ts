import { Patient, Seller } from "@/types";

/** The Seller + Coordinator filters shared by the patients list, dashboard, calendar and
 * transfers. They decide *which patients* a page shows — never whose money: commission shown
 * anywhere is still only the viewer's own. Plain data and functions, so the pages, the
 * filter bar and the saved-default action all agree on what a value means. */

export type FilterPage = "patients" | "dashboard" | "calendar" | "transfers";
export const FILTER_PAGES: FilterPage[] = ["patients", "dashboard", "calendar", "transfers"];

/** Each half holds any number of choices; empty means everyone ("All"). */
export interface PeopleFilter {
  /** "me" and/or sellers' ids (accounts and sellers without one). */
  sellers: string[];
  /** "me", "none" (no coordinator) and/or members' ids. */
  coordinators: string[];
}

export type SavedFilters = Partial<Record<FilterPage, PeopleFilter>>;

export const ALL_FILTER: PeopleFilter = { sellers: [], coordinators: [] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHOICES = 50;

/** From an array, a comma-separated link value, or a saved default from before choices
 * could be combined ("all" / "me" / one id). Unknown values are dropped. */
function cleanList(raw: unknown, allowNone: boolean): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const ok = items
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v === "me" || (allowNone && v === "none") || UUID_RE.test(v));
  return [...new Set(ok)].slice(0, MAX_CHOICES);
}

/** Anything from the client, a link or the database, made into a valid filter. */
export function cleanPeopleFilter(raw: unknown): PeopleFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    sellers: cleanList(r.sellers ?? r.seller, false),
    coordinators: cleanList(r.coordinators ?? r.coordinator, true),
  };
}

export function parseSavedFilters(raw: unknown): SavedFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: SavedFilters = {};
  for (const page of FILTER_PAGES) if (r[page]) out[page] = cleanPeopleFilter(r[page]);
  return out;
}

export function isAllFilter(f: PeopleFilter): boolean {
  return f.sellers.length === 0 && f.coordinators.length === 0;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

export function sameFilter(a: PeopleFilter, b: PeopleFilter): boolean {
  return sameSet(a.sellers, b.sellers) && sameSet(a.coordinators, b.coordinators);
}

/** Drops anyone no longer offered (deleted, merged, never signed in), so a stale default
 * never silently empties a page; an id of the viewer's own becomes "me", which is how the
 * filter offers them. */
export function resolveFilter(
  f: PeopleFilter | undefined,
  sellerIds: Set<string>,
  coordinatorIds: Set<string>,
  currentUserId: string
): PeopleFilter {
  if (!f) return ALL_FILTER;
  const keep = (values: string[], ids: Set<string>) => [
    ...new Set(values.map((v) => (v === currentUserId ? "me" : v)).filter((v) => v === "me" || v === "none" || ids.has(v))),
  ];
  return { sellers: keep(f.sellers, sellerIds), coordinators: keep(f.coordinators, coordinatorIds) };
}

/** A patient matches when its seller is any of the chosen sellers and its coordinator any of
 * the chosen coordinators (an empty half matches everyone). */
export function matchesPeopleFilter(
  p: Pick<Patient, "responsible_seller_id" | "coordinator_id">,
  f: PeopleFilter,
  me: string
): boolean {
  const is = (value: string, id: string | null) => (value === "none" ? id == null : id === (value === "me" ? me : value));
  if (f.sellers.length > 0 && !f.sellers.some((v) => is(v, p.responsible_seller_id))) return false;
  if (f.coordinators.length > 0 && !f.coordinators.some((v) => is(v, p.coordinator_id))) return false;
  return true;
}

/** The sellers a filter offers: everyone who can get credit for a sale, except accounts that
 * have never signed in (no name yet — they can't have sold anything). */
export function sellerFilterOptions(sellers: Seller[]): { id: string; name: string }[] {
  return sellers
    .filter((s) => !!s.name?.trim())
    .map((s) => ({ id: s.id, name: s.name!.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Only the viewer in the Seller filter: every patient shown is theirs. */
export function onlyMine(f: PeopleFilter): boolean {
  return f.sellers.length === 1 && f.sellers[0] === "me";
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
