import { Patient, PatientExtra, PatientExtraKind, MoneyPatient } from "@/types";
import { visitExpectedTotal } from "@/lib/commission";

/** Owed vs paid for one visit. Owed = the agreed treatment price + extras sold on the visit − its discount;
 * paid = its payments (card surcharges excluded — they're on top, not toward the bill). */
export interface VisitBalance {
  key: string;
  label: string;
  date: string | null;
  status: "upcoming" | "completed";
  owed: number;
  paid: number;
  /** owed − paid: positive = still due, negative = overpaid. */
  due: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function visitBalances(p: MoneyPatient): VisitBalance[] {
  const paidFor = (key: string) =>
    p.payments.filter((x) => (x.extra_visit_id ?? `visit${x.visit_number}`) === key).reduce((s, x) => s + x.amount, 0);
  const make = (
    key: string,
    label: string,
    date: string | null,
    status: "upcoming" | "completed",
    expected: number | null
  ): VisitBalance => {
    // price + extras − discount
    const owed = round(visitExpectedTotal(p, key, expected) ?? 0);
    const paid = round(paidFor(key));
    return { key, label, date, status, owed, paid, due: round(owed - paid) };
  };

  return [
    make("visit1", "Visit 1", p.visit1_date, p.visit1_status, p.visit1_expected),
    ...(p.needs_visit2 ? [make("visit2", "Visit 2", p.visit2_date, p.visit2_status, p.visit2_expected)] : []),
    ...p.extra_visits.map((v) => make(v.id, v.label, v.visit_date, v.status, v.expected)),
  ].filter((b) => b.owed > 0 || b.paid > 0);
}

export function patientBalance(p: MoneyPatient): { owed: number; paid: number; due: number } {
  const all = visitBalances(p);
  const owed = round(all.reduce((s, b) => s + b.owed, 0));
  const paid = round(all.reduce((s, b) => s + b.paid, 0));
  return { owed, paid, due: round(owed - paid) };
}

/** Payment for this visit is under way: money has been taken, the visit is marked completed,
 * or its date has come. From then on anything still owed is due now — before that, it's just
 * what the patient will pay later. */
export function isDueNow(b: VisitBalance, todayIso: string): boolean {
  return b.paid > 0 || b.status === "completed" || (!!b.date && b.date <= todayIso);
}

/** A visit whose money doesn't add up and should be looked at: overpaid, or due now and
 * still short (e.g. £3,000 taken on a £3,700 visit — flagged the moment it's recorded). */
export function isMismatch(b: VisitBalance, todayIso: string): boolean {
  if (b.due < 0) return true;
  return b.due > 0 && isDueNow(b, todayIso);
}

/** Across a patient's visits: what's short right now (the mismatched visits), and what's
 * owed for visits that haven't started yet. */
export function patientDueNow(p: MoneyPatient, todayIso: string) {
  const all = visitBalances(p);
  const short = all.filter((b) => isMismatch(b, todayIso));
  return {
    short,
    dueNow: round(short.reduce((s, b) => s + Math.max(0, b.due), 0)),
    overpaid: round(short.reduce((s, b) => s + Math.max(0, -b.due), 0)),
    upcoming: round(all.filter((b) => !isDueNow(b, todayIso)).reduce((s, b) => s + Math.max(0, b.due), 0)),
    anyOwed: all.length > 0,
  };
}

/** Local-date "YYYY-MM-DD" for today. */
export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today" where the clinics are, for server code — the server runs in UTC, which is still
 * yesterday for Antalya's first three hours. (In the browser, todayIsoLocal is already local.) */
export function clinicTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

/** Extras sold on one visit ("visit1" | "visit2" | an extra visit's id), oldest first. */
export function extrasFor(p: Patient, visitKey: string): PatientExtra[] {
  return p.extras.filter((e) => (e.extra_visit_id ?? `visit${e.visit_number}`) === visitKey);
}

const EXTRA_KIND_NAMES: Record<PatientExtraKind, { en: string; tr: string }> = {
  night: { en: "Extra night", tr: "Ekstra gece" },
  treatment: { en: "Extra treatment", tr: "Ekstra tedavi" },
  other: { en: "Extra", tr: "Ekstra" },
};

/** "2 × Extra night — Renex Hotel" (or Turkish, for Telegram). */
export function extraLabel(e: PatientExtra, lang: "en" | "tr" = "en"): string {
  const name = EXTRA_KIND_NAMES[e.kind][lang];
  const qty = e.quantity !== 1 ? `${e.quantity} × ` : "";
  return `${qty}${name}${e.description ? ` — ${e.description}` : ""}`;
}

/** The single amount a document or message shows for a visit: what was paid once anything
 * was, otherwise the agreed price + extras. Null when neither exists. */
export function visitAmount(p: MoneyPatient, visitKey: string): number | null {
  const [expected, actual] =
    visitKey === "visit1"
      ? [p.visit1_expected, p.visit1_actual]
      : visitKey === "visit2"
      ? [p.visit2_expected, p.visit2_actual]
      : (() => {
          const v = p.extra_visits.find((x) => x.id === visitKey);
          return [v?.expected ?? null, v?.actual ?? null];
        })();
  return actual ?? visitExpectedTotal(p, visitKey, expected);
}
