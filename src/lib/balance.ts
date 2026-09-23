import { Patient } from "@/types";
import { extrasTotalFor } from "@/lib/commission";

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
