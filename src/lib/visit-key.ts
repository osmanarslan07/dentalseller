/** A visit is referred to by one string key everywhere in the app — "visit1", "visit2", or an
 * extra visit's id — and stored as (visit_number, extra_visit_id) on per-visit rows like
 * transfers, extras and payments. */
export type VisitRef = { visit_number: 1 | 2 | null; extra_visit_id: string | null };

export function visitRef(visitKey: string): VisitRef {
  if (visitKey === "visit1") return { visit_number: 1, extra_visit_id: null };
  if (visitKey === "visit2") return { visit_number: 2, extra_visit_id: null };
  return { visit_number: null, extra_visit_id: visitKey };
}

export function visitKeyOf(row: VisitRef): string {
  return row.extra_visit_id ?? `visit${row.visit_number}`;
}

export function visitLabel(visitKey: string, extraVisits: { id: string; label: string }[]): string {
  if (visitKey === "visit1") return "Visit 1";
  if (visitKey === "visit2") return "Visit 2";
  return extraVisits.find((v) => v.id === visitKey)?.label ?? "Extra visit";
}
