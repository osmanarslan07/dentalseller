import { Patient, PatientExtra, PatientExtraKind } from "@/types";
import { extrasTotalFor, visitExpectedTotal } from "@/lib/commission";

/** Owed vs paid for one visit. Owed = the agreed treatment price + extras sold on the visit;
 * paid = its payments (card surcharges excluded — they're on top, not toward the bill). */
export interface VisitBalance {
  key: string;
  label: string;
  date: string | null;
  owed: number;
  paid: number;
  /** owed − paid: positive = still due, negative = overpaid. */
  due: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function visitBalances(p: Patient): VisitBalance[] {
  const paidFor = (key: string) =>
    p.payments.filter((x) => (x.extra_visit_id ?? `visit${x.visit_number}`) === key).reduce((s, x) => s + x.amount, 0);
  const make = (key: string, label: string, date: string | null, expected: number | null): VisitBalance => {
    const owed = round((expected ?? 0) + extrasTotalFor(p, key));
    const paid = round(paidFor(key));
    return { key, label, date, owed, paid, due: round(owed - paid) };
  };

  return [
    make("visit1", "Visit 1", p.visit1_date, p.visit1_expected),
    ...(p.needs_visit2 ? [make("visit2", "Visit 2", p.visit2_date, p.visit2_expected)] : []),
    ...p.extra_visits.map((v) => make(v.id, v.label, v.visit_date, v.expected)),
  ].filter((b) => b.owed > 0 || b.paid > 0);
}

export function patientBalance(p: Patient): { owed: number; paid: number; due: number } {
  const all = visitBalances(p);
  const owed = round(all.reduce((s, b) => s + b.owed, 0));
  const paid = round(all.reduce((s, b) => s + b.paid, 0));
  return { owed, paid, due: round(owed - paid) };
}

/** A visit whose money doesn't add up and should be looked at: it has happened (dated on or
 * before `todayIso`) and is still owed something, or anything was overpaid. */
export function isMismatch(b: VisitBalance, todayIso: string): boolean {
  if (b.due < 0) return true;
  return b.due > 0 && !!b.date && b.date <= todayIso;
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
export function visitAmount(p: Patient, visitKey: string): number | null {
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
