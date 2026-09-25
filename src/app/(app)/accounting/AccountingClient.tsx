"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/commission";
import { isMismatch, todayIsoLocal as todayIso, visitBalances } from "@/lib/balance";
import { visitLabel } from "@/lib/visit-key";
import { downloadCsv, escapeCsv } from "@/lib/csv";
import { Patient, PatientPayment, PaymentMethod, Profile, Seller } from "@/types";
import { sellerNameMap } from "@/lib/sellers";
import { useCurrencies } from "@/components/currency";
import { dealToMain, paymentFx, surchargeMain } from "@/lib/money";

const METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", bank: "Bank transfer" };

type LedgerRow = { payment: PatientPayment; patient: Patient; visit: string };

/** Pre-accounting: what came in (by month, split by method) and what's still open. Money
 * collected only — no commission here, so every team member can use it. Totals are in the
 * clinic's main currency: each payment at the rate on the day it came in. A payment in another
 * currency also shows what was handed over, and the difference against the rate the price was
 * agreed at is the exchange-rate gain / loss. */
export function AccountingClient({ patients, profiles, sellers }: { patients: Patient[]; profiles: Profile[]; sellers: Seller[] }) {
  const today = todayIso();
  const { main } = useCurrencies();
  const gbp = (n: number) => formatCurrency(n, main);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [receivedBy, setReceivedBy] = useState("all");
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name || "—";
  const sellerNames = sellerNameMap(sellers);

  const allPayments: LedgerRow[] = useMemo(
    () =>
      patients.flatMap((p) =>
        p.payments.map((payment) => ({
          payment,
          patient: p,
          visit: visitLabel(payment.extra_visit_id ?? `visit${payment.visit_number}`, p.extra_visits),
        }))
      ),
    [patients]
  );

  const months = useMemo(() => {
    const set = new Set([today.slice(0, 7), ...allPayments.map((r) => r.payment.paid_on.slice(0, 7))]);
    return [...set].sort().reverse();
  }, [allPayments, today]);

  const ledger = useMemo(
    () =>
      allPayments
        .filter((r) => r.payment.paid_on.slice(0, 7) === month)
        .filter((r) => receivedBy === "all" || r.payment.received_by === receivedBy)
        .sort((a, b) => b.payment.paid_on.localeCompare(a.payment.paid_on) || b.payment.created_at.localeCompare(a.payment.created_at)),
    [allPayments, month, receivedBy]
  );

  const totals = useMemo(() => {
    const t = { all: 0, cash: 0, card: 0, bank: 0, surcharge: 0, fx: 0 };
    for (const { payment, patient } of ledger) {
      t.all += payment.main_amount;
      t[payment.method] += payment.main_amount;
      t.surcharge += surchargeMain(payment);
      t.fx += paymentFx(patient, payment);
    }
    t.fx = Math.round(t.fx * 100) / 100;
    return t;
  }, [ledger]);
  // only a clinic with payments in (or prices agreed in) other currencies has any of this
  const anyForeign = allPayments.some((r) => r.payment.currency !== main || r.patient.currency !== main);

  const openBalances = useMemo(
    () =>
      patients
        .flatMap((p) => visitBalances(p).filter((b) => isMismatch(b, today)).map((b) => ({ patient: p, balance: b })))
        .sort((a, b) => (a.balance.date ?? "").localeCompare(b.balance.date ?? "")),
    [patients, today]
  );
  // what's still due, in the main currency at each patient's agreed rate
  const outstanding = openBalances.reduce((s, r) => s + dealToMain(r.patient, Math.max(0, r.balance.due)), 0);

  function exportCsv() {
    const header = [
      "Date",
      "Patient",
      "Visit",
      "Method",
      "Amount",
      "Card surcharge",
      "Total paid",
      "Received by",
      "Note",
      ...(anyForeign ? ["Paid", "Paid currency", `Rate to ${main}`, `Exchange gain/loss (${main})`] : []),
    ];
    const rows = ledger.map(({ payment: x, patient, visit }) =>
      [
        x.paid_on,
        patient.name,
        visit,
        METHOD_LABELS[x.method],
        x.main_amount.toFixed(2),
        surchargeMain(x).toFixed(2),
        (x.main_amount + surchargeMain(x)).toFixed(2),
        nameOf(x.received_by),
        x.note,
        ...(anyForeign ? [x.paid_amount.toFixed(2), x.currency, x.rate_to_main, paymentFx(patient, x).toFixed(2)] : []),
      ]
        .map(escapeCsv)
        .join(",")
    );
    downloadCsv(`payments-${month}.csv`, [header.join(","), ...rows].join("\n"));
  }

  const tiles = [
    { label: "Collected", value: totals.all, strong: true },
    { label: "Cash", value: totals.cash },
    { label: "Card", value: totals.card },
    { label: "Bank transfer", value: totals.bank },
    { label: "Card surcharges", value: totals.surcharge, hint: "on top, not commissionable" },
    ...(anyForeign
      ? [{ label: "Exchange-rate gain / loss", value: totals.fx, hint: "vs the rates prices were agreed at" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounting</h1>
          <p className="mt-1 text-sm text-slate-500">Payments collected, by month, and every visit that doesn&apos;t add up yet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" aria-label="Month">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
          <Select value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="w-auto" aria-label="Received by">
            <option value="all">Received by anyone</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || "Unnamed"}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${anyForeign ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.label}</p>
            <p className={`mt-1 ${t.strong ? "text-2xl font-semibold text-slate-900" : "text-lg font-medium text-slate-800"}`}>
              {gbp(t.value)}
            </p>
            {t.hint && <p className="text-xs text-slate-400">{t.hint}</p>}
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Payments · {monthLabel(month)}</h2>
            <p className="text-xs text-slate-500">{ledger.length} payment{ledger.length === 1 ? "" : "s"}</p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={exportCsv} disabled={ledger.length === 0}>
            Export CSV
          </Button>
        </div>
        {ledger.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No payments recorded this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-5 pr-4 font-medium">Date</th>
                  <th className="py-3 pr-4 font-medium">Patient</th>
                  <th className="py-3 pr-4 font-medium">Method</th>
                  <th className="py-3 pr-4 text-right font-medium">Amount</th>
                  <th className="py-3 pr-4 text-right font-medium">Surcharge</th>
                  <th className="py-3 pr-5 font-medium">Received by</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(({ payment: x, patient, visit }) => (
                  <tr key={x.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pl-5 pr-4 text-slate-600">{formatDate(x.paid_on)}</td>
                    <td className="py-2.5 pr-4">
                      <Link href={`/patients/${patient.id}`} className="font-medium text-slate-800 hover:text-teal-700">
                        {patient.name}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {visit}
                        {x.note ? ` · ${x.note}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={x.method === "cash" ? "green" : x.method === "card" ? "blue" : "slate"}>
                        {METHOD_LABELS[x.method]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-900">
                      {gbp(x.main_amount)}
                      {x.currency !== main && (
                        <div className="text-xs font-normal text-slate-400">{formatCurrency(x.paid_amount, x.currency)}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-500">{x.surcharge_amount > 0 ? gbp(surchargeMain(x)) : "—"}</td>
                    <td className="py-2.5 pr-5 text-slate-600">{nameOf(x.received_by)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/60 font-semibold text-slate-900">
                  <td className="py-3 pl-5 pr-4" colSpan={3}>
                    Total
                  </td>
                  <td className="py-3 pr-4 text-right">{gbp(totals.all)}</td>
                  <td className="py-3 pr-4 text-right">{totals.surcharge > 0 ? gbp(totals.surcharge) : "—"}</td>
                  <td className="py-3 pr-5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Open balances</h2>
            <p className="text-xs text-slate-500">
              Visits already paid into, completed or past their date that are still short (price + extras vs payments), or
              overpaid — all months.
            </p>
          </div>
          {outstanding > 0 && <Badge tone="amber">{gbp(outstanding)} outstanding</Badge>}
        </div>
        {openBalances.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Every visit is paid in full ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-5 pr-4 font-medium">Patient</th>
                  <th className="py-3 pr-4 font-medium">Visit date</th>
                  <th className="py-3 pr-4 text-right font-medium">Owed</th>
                  <th className="py-3 pr-4 text-right font-medium">Paid</th>
                  <th className="py-3 pr-4 text-right font-medium">Difference</th>
                  <th className="py-3 pr-5 font-medium">Seller</th>
                </tr>
              </thead>
              <tbody>
                {openBalances.map(({ patient, balance: b }) => (
                  <tr key={`${patient.id}-${b.key}`} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pl-5 pr-4">
                      <Link href={`/patients/${patient.id}`} className="font-medium text-slate-800 hover:text-teal-700">
                        {patient.name}
                      </Link>
                      <div className="text-xs text-slate-400">{b.label}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{b.date ? formatDate(b.date) : "—"}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-700">{formatCurrency(b.owed, patient.currency)}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-700">{formatCurrency(b.paid, patient.currency)}</td>
                    <td className="py-2.5 pr-4 text-right">
                      {b.due > 0 ? (
                        <Badge tone="amber">{formatCurrency(b.due, patient.currency)} due</Badge>
                      ) : (
                        <Badge tone="blue">Overpaid {formatCurrency(-b.due, patient.currency)}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-slate-600">{sellerNames.get(patient.responsible_seller_id) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
