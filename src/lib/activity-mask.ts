import { ActivityLogRow, describeActivity } from "@/lib/activity-log";

/** De-identifies clinic activity for the superadmin panel: who did what, when, and which
 * fields changed — but never a patient's name or any free text that could identify one.
 * Values are shown only for fields that can't (dates, amounts, statuses, yes/no flags);
 * everything else becomes "<field> changed". Full detail is one step away, inside support
 * mode, where viewing it is logged. */

/** Labels written by diffFields() across patients, visits, quotes and tasks whose values are
 * safe to show. Anything not listed here is masked. */
const SAFE_LABELS = new Set<string>([
  "confirmed",
  "needs visit 2",
  "visit2 recall months",
  ...["visit1", "visit2"].flatMap((v) =>
    [
      "date",
      "expected",
      "actual",
      "status",
      "arrival date",
      "arrival time",
      "departure date",
      "departure time",
      "room type",
      "arrival transfer",
      "departure transfer",
      "hotel arranged",
      "pax",
    ].map((f) => `${v} ${f}`)
  ),
  // extra visits (unprefixed)
  "date",
  "expected",
  "actual",
  "status",
  "arrival date",
  "arrival time",
  "departure date",
  "departure time",
  "room type",
  "arrival transfer",
  "departure transfer",
  "hotel arranged",
  "pax",
  // quotes
  "total",
  "currency",
  "split mode",
  "deposit %",
  "first visit amount",
  "bone graft note included",
  // tasks
  "due date",
  "due time",
]);

/** Free-text labels — never shown with values, but needed to split a diff correctly. */
const MASKED_LABELS = [
  "name",
  "treatment",
  "notes",
  "komo reference",
  "phone",
  "label",
  "intro text",
  "inclusions",
  "bone graft note",
  "title",
  "linked patient",
  "hotel",
  "arrival flight",
  "departure flight",
  ...["visit1", "visit2"].flatMap((v) => [`${v} hotel`, `${v} arrival flight`, `${v} departure flight`]),
];

const ALL_LABELS = [...SAFE_LABELS, ...MASKED_LABELS].sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\%]/g, "\\$&");
const SEGMENT_SPLIT = new RegExp(`, (?=(?:${ALL_LABELS.map(escape).join("|")}) )`);

function maskDiff(diff: string): string {
  return diff
    .split(SEGMENT_SPLIT)
    .map((segment) => {
      const label = ALL_LABELS.find((l) => segment.startsWith(`${l} `));
      if (label && SAFE_LABELS.has(label)) return segment;
      return `${label ?? "a field"} changed`;
    })
    .join(", ");
}

/** Actions whose `detail` is a patient/quote name, task title or visit label — dropped. */
const NAME_DETAIL_ACTIONS = new Set([
  "patient_created",
  "patient_deleted",
  "quote_created",
  "quote_duplicated",
  "quote_deleted",
  "task_created",
  "task_deleted",
  "visit_added",
  "visit_deleted",
]);

/** Actions whose `detail` is a diffFields() string. */
const DIFF_ACTIONS = new Set(["patient_updated", "visit_updated", "quote_updated", "task_updated"]);

const REF_PREFIX: Record<string, string> = { patient: "P", quote: "Q", task: "T" };

/** "#P-7F3A" — stable per record, meaningless outside the clinic. */
export function recordRef(targetType: string, targetId: string | null): string | null {
  const prefix = REF_PREFIX[targetType];
  if (!prefix || !targetId) return null;
  return `#${prefix}-${targetId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function maskActivityDetail(entry: ActivityLogRow): string | null {
  if (!entry.detail) return null;
  if (NAME_DETAIL_ACTIONS.has(entry.action)) return null;
  if (DIFF_ACTIONS.has(entry.action)) return maskDiff(entry.detail);
  return entry.detail;
}

/** One de-identified line: staff names stay (they're staff, not patients), records become
 * references. */
export function describeMaskedActivity(entry: ActivityLogRow, staffNameById: Map<string, string>): string {
  const ref = recordRef(entry.target_type, entry.target_id);
  const masked: ActivityLogRow = { ...entry, detail: maskActivityDetail(entry) };
  // describeActivity looks patients up by id — hand it the reference instead of a name
  const patientRefs = new Map(entry.target_type === "patient" && entry.target_id && ref ? [[entry.target_id, `patient ${ref}`]] : []);
  const text = describeActivity(masked, staffNameById, patientRefs).replace("patient patient ", "patient ");
  if (!ref) return text;
  // deletions describe the record by its (now dropped) name — show the reference there
  if (text.includes("(unnamed)")) return text.replace("(unnamed)", ref);
  return entry.target_type !== "patient" ? `${text} · ${ref}` : text;
}
