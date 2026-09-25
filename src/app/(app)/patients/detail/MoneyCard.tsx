"use client";

import { FormEvent, ReactNode, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCelebrationSound } from "@/components/celebration-sound";
import { useCurrencies } from "@/components/currency";
import { fireConfetti, playChime } from "@/lib/celebrate";
import { extraLabel } from "@/lib/balance";
import { currencySymbol, dealToMain, RATE_SOURCE_LABELS, rateLabel } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Patient, PatientExtra, PatientExtraKind, PatientPayment, PaymentMethod, Profile } from "@/types";
import { addPayment, deletePayment, updatePayment } from "../payment-actions";
import { addPatientExtra, deletePatientExtra, updatePatientExtra } from "../extra-actions";
import { updateVisitFields } from "../actions";
import { setVisitDiscount } from "../discount-actions";
import { previewPaymentRates, setDealCurrency } from "../currency-actions";
import { discountAmount, type VisitDiscountSetting } from "@/lib/commission";
import { RowMenu } from "./Menu";
import { CheckIcon, LABEL_CAPS, moneyIn, PencilIcon, Pill, PillTone, Section, Segmented, Toggle } from "./bits";
import { shortDate, VisitView } from "./visits";
import { useCan } from "@/components/permissions";

const METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", bank: "Bank" };
const METHOD_TONES: Record<PaymentMethod, PillTone> = { cash: "green", card: "blue", bank: "slate" };
const KIND_LABELS: Record<PatientExtraKind, string> = { night: "Night", treatment: "Treatment", other: "Other" };
const KIND_TONES: Record<PatientExtraKind, PillTone> = { night: "blue", treatment: "green", other: "slate" };
const pct = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
const round = (n: number) => Math.round(n * 100) / 100;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The patient's deal currency and the rate it was agreed at (into the main currency). */
export type DealInfo = Pick<Patient, "currency" | "deal_rate" | "deal_rate_on" | "deal_rate_source">;

type Editing =
  | { type: "price" }
  | { type: "discount" }
  | { type: "extra"; id: string | null }
  | { type: "payment"; id: string | null }
  | { type: "currency" }
  | null;

/** One visit's money, top to bottom: the agreed price, extras on top, any discount, what that makes owed,
 * the payments against it, and what's still due. Every row edits in place; delete sits in
 * the row's ⋯ menu. Everything is in the patient's deal currency; the clinic's main currency
 * shows alongside when they differ. */
export function MoneyCard({
  patientId,
  deal,
  patientHasPayments,
  visit,
  extras,
  payments,
  profiles,
  currentUserId,
  surchargeRate,
  costs,
  dueNow,
  sellerName,
  discount,
}: {
  /** The visit's discount as set (amount or %), or null. */
  discount: VisitDiscountSetting | null;
  patientId: string;
  deal: DealInfo;
  /** Any payment on any of the patient's visits — the deal currency is locked from then on. */
  patientHasPayments: boolean;
  visit: VisitView;
  extras: PatientExtra[];
  payments: PatientPayment[];
  profiles: Profile[];
  currentUserId: string;
  surchargeRate: number;
  /** The visit's costs (main currency) — only when the clinic deducts them before commission. */
  costs: { hotel: number; transfers: number } | null;
  /** Payment for the visit is under way (paid into, completed, or its date has come). */
  dueNow: boolean;
  sellerName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();
  const currencies = useCurrencies();
  const main = currencies.main;
  const [editing, setEditing] = useState<Editing>(null);
  // prices and extras need money.edit (a price is saved on the visit, so patients.edit too);
  // payments need payments.record
  const canExtras = useCan("money.edit");
  const canEditVisit = useCan("patients.edit");
  const canPrice = canExtras && canEditVisit;
  const canPay = useCan("payments.record");
  const canEditPayments = useCan("payments.edit");
  const [pending, startTransition] = useTransition();

  const fmt = moneyIn(deal.currency);
  const fmtMain = moneyIn(main);
  const foreign = deal.currency !== main;
  // the currency bar: only for a clinic that deals in several, or a patient not in the main one
  const showCurrency = currencies.multi || foreign;

  const extrasTotal = round(extras.reduce((s, e) => s + e.total, 0));
  const base = round((visit.expected ?? 0) + extrasTotal);
  const discountOff = discountAmount(discount, base);
  const owed = round(base - discountOff);
  const paid = round(payments.reduce((s, p) => s + p.amount, 0));
  const due = round(owed - paid);
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name || "—";

  function run(action: () => Promise<void>, done: string) {
    startTransition(async () => {
      try {
        await action();
        showToast(done);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      }
    });
  }

  function deleteExtra(e: PatientExtra) {
    if (!confirm(`Delete ${extraLabel(e)}?`)) return;
    run(() => deletePatientExtra(e.id), "Extra deleted");
  }

  function deletePaymentRow(p: PatientPayment) {
    if (!confirm(`Delete the ${moneyIn(p.currency)(p.paid_amount)} ${METHOD_LABELS[p.method].toLowerCase()} payment?`)) return;
    run(() => deletePayment(p.id), "Payment deleted");
  }

  // commission is worked out in the main currency (at the agreed rate), after the clinic's costs
  const commissionBase =
    costs && costs.hotel + costs.transfers > 0
      ? Math.max(0, dealToMain(deal, payments.length ? paid : owed) - costs.hotel - costs.transfers)
      : null;
  const surcharges = round(payments.reduce((s, p) => s + p.surcharge_amount, 0));

  return (
    <Section
      title="Money"
      actions={
        <>
          {canExtras && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing({ type: "extra", id: null })}>
              + Extra
            </Button>
          )}
          {canPay && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing({ type: "payment", id: null })}>
              + Record payment
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col text-sm">
        {/* Deal currency */}
        {showCurrency &&
          (editing?.type === "currency" ? (
            <FormBox>
              <DealCurrencyForm
                deal={deal}
                main={main}
                options={currencies.list.includes(deal.currency) ? currencies.list : [...currencies.list, deal.currency]}
                locked={patientHasPayments}
                onCancel={() => setEditing(null)}
                onSave={async (currency, rate) => {
                  await setDealCurrency(patientId, currency, rate);
                  showToast("Deal currency saved ✓");
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                Prices in <span className="font-semibold text-slate-900">{deal.currency}</span>
              </span>
              {foreign && (
                <span>
                  · {rateLabel(deal.currency, main, deal.deal_rate)}
                  {deal.deal_rate_source && ` (${RATE_SOURCE_LABELS[deal.deal_rate_source]}`}
                  {deal.deal_rate_source && deal.deal_rate_on && `, ${formatDate(deal.deal_rate_on)}`}
                  {deal.deal_rate_source && ")"}
                </span>
              )}
              {canPrice && (
                <button
                  type="button"
                  onClick={() => setEditing({ type: "currency" })}
                  className="ml-auto font-semibold text-teal-700 hover:text-teal-800"
                >
                  Change
                </button>
              )}
            </div>
          ))}

        {/* Price */}
        {editing?.type === "price" ? (
          <PriceForm
            visit={visit}
            currency={deal.currency}
            onCancel={() => setEditing(null)}
            onSave={async (value) => {
              await updateVisitFields(patientId, visit.key, { expected: value });
              showToast("Price saved ✓");
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex items-center gap-2.5 py-2">
            <span className="grow font-semibold">Treatment price</span>
            {visit.expected == null ? (
              <span className="text-xs text-slate-500">not agreed yet</span>
            ) : (
              visit.kind === "main" && <span className="hidden text-xs text-slate-500 sm:inline">agreed by {sellerName}</span>
            )}
            <Amount>{visit.expected == null ? "—" : fmt(visit.expected)}</Amount>
            {canPrice && (
              <IconButton label="Edit price" onClick={() => setEditing({ type: "price" })}>
                <PencilIcon />
              </IconButton>
            )}
          </div>
        )}

        {/* Extras */}
        <span className={`${LABEL_CAPS} pt-2`}>Extras</span>
        {extras.length === 0 && editing?.type !== "extra" && <span className="py-2 text-[13px] text-slate-500">None yet</span>}
        {extras.map((e) =>
          editing?.type === "extra" && editing.id === e.id ? (
            <FormBox key={e.id}>
              <ExtraForm
                extra={e}
                currency={deal.currency}
                hotel={visit.hotel_name}
                onCancel={() => setEditing(null)}
                onSave={async (fd) => {
                  await updatePatientExtra(e.id, fd);
                  showToast("Extra saved ✓");
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div key={e.id} className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
              <Pill tone={KIND_TONES[e.kind]} small>
                {KIND_LABELS[e.kind]}
              </Pill>
              <span className="min-w-0 grow truncate">{e.description || extraLabel(e)}</span>
              <span className="hidden text-xs text-slate-500 sm:inline">
                {e.quantity} × {fmt(e.unit_price)}
              </span>
              <Amount>+ {fmt(e.total)}</Amount>
              {canExtras && <RowMenu
                label="Extra actions"
                items={[
                  { label: "Edit", onSelect: () => setEditing({ type: "extra", id: e.id }) },
                  { label: "Delete extra…", danger: true, divider: true, disabled: pending, onSelect: () => deleteExtra(e) },
                ]}
              />}
            </div>
          )
        )}
        {editing?.type === "extra" && editing.id === null && (
          <FormBox>
            <ExtraForm
              currency={deal.currency}
              hotel={visit.hotel_name}
              onCancel={() => setEditing(null)}
              onSave={async (fd) => {
                await addPatientExtra(patientId, visit.key, fd);
                showToast("Extra added ✓");
                setEditing(null);
                router.refresh();
              }}
            />
          </FormBox>
        )}

        {/* Discount */}
        {editing?.type === "discount" ? (
          <FormBox>
            <DiscountForm
              discount={discount}
              currency={deal.currency}
              onCancel={() => setEditing(null)}
              onSave={async (fd) => {
                await setVisitDiscount(patientId, visit.key, fd);
                showToast(String(fd.get("discount_value") ?? "").trim() ? "Discount saved ✓" : "Discount removed");
                setEditing(null);
                router.refresh();
              }}
            />
          </FormBox>
        ) : discount ? (
          <div className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
            <span className="grow">
              <span className="font-semibold">Discount</span>
              {discount.type === "percent" && <span className="ml-1.5 text-xs text-slate-500">{discount.value}%</span>}
              {discount.reason && <span className="block truncate text-xs text-slate-500">{discount.reason}</span>}
            </span>
            <Amount>− {fmt(discountOff)}</Amount>
            {canPrice ? (
              <RowMenu
                label="Discount actions"
                items={[
                  { label: "Edit", onSelect: () => setEditing({ type: "discount" }) },
                  {
                    label: "Remove discount…",
                    danger: true,
                    divider: true,
                    disabled: pending,
                    onSelect: () => {
                      if (!confirm("Remove the discount on this visit?")) return;
                      const fd = new FormData();
                      run(() => setVisitDiscount(patientId, visit.key, fd), "Discount removed");
                    },
                  },
                ]}
              />
            ) : (
              <span className="w-7" />
            )}
          </div>
        ) : (
          canPrice &&
          base > 0 && (
            <button
              type="button"
              onClick={() => setEditing({ type: "discount" })}
              className="self-start py-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
            >
              + Discount
            </button>
          )
        )}

        {/* Owed */}
        <div className="mt-1.5 flex items-center gap-2.5 border-t-2 border-slate-900 py-2.5">
          <span className="grow font-bold">
            Owed for this visit
            {foreign && owed > 0 && (
              <span className="block text-xs font-normal text-slate-500">≈ {fmtMain(dealToMain(deal, owed))} at the agreed rate</span>
            )}
          </span>
          <Amount bold>{fmt(owed)}</Amount>
          <span className="w-7" />
        </div>

        {/* Payments */}
        <span className={`${LABEL_CAPS} pt-1.5`}>Payments</span>
        {payments.length === 0 && editing?.type !== "payment" && (
          <span className="py-2 text-[13px] text-slate-500">
            {dueNow || owed === 0 ? "Nothing recorded yet." : "Nothing collected — not due until the visit starts."}
          </span>
        )}
        {payments.map((p) =>
          editing?.type === "payment" && editing.id === p.id ? (
            <FormBox key={p.id}>
              <PaymentForm
                payment={p}
                dealCurrency={deal.currency}
                visitLabel={visit.label}
                profiles={profiles}
                currentUserId={currentUserId}
                surchargeRate={p.surcharge_rate ?? surchargeRate}
                suggestedAmount={p.paid_amount}
                onCancel={() => setEditing(null)}
                onSave={async (fd) => {
                  await updatePayment(p.id, fd);
                  showToast("Payment saved ✓");
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div key={p.id} className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
              <Pill tone={METHOD_TONES[p.method]} small>
                {METHOD_LABELS[p.method]}
              </Pill>
              <span className="min-w-0 grow">
                {shortDate(p.paid_on)} <span className="text-slate-500">· received by {nameOf(p.received_by)}</span>
                {p.currency !== deal.currency && (
                  <span className="block text-xs text-slate-500">
                    Paid {moneyIn(p.currency)(p.paid_amount)} at {rateLabel(p.currency, deal.currency, p.rate_to_deal)}
                    {p.rate_source === "manual" && " (set by hand)"}
                  </span>
                )}
                {p.note && <span className="block truncate text-xs text-slate-500 sm:hidden">{p.note}</span>}
              </span>
              <span className="hidden max-w-[40%] truncate text-xs text-slate-500 sm:inline">
                {[p.note, p.surcharge_amount > 0 ? `+ ${fmt(p.surcharge_amount)} surcharge (${pct(p.surcharge_rate ?? 0)})` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <Amount>− {fmt(p.amount)}</Amount>
              {canEditPayments && <RowMenu
                label="Payment actions"
                items={[
                  { label: "Edit", onSelect: () => setEditing({ type: "payment", id: p.id }) },
                  { label: "Delete payment…", danger: true, divider: true, disabled: pending, onSelect: () => deletePaymentRow(p) },
                ]}
              />}
            </div>
          )
        )}
        {editing?.type === "payment" && editing.id === null && (
          <FormBox>
            <PaymentForm
              dealCurrency={deal.currency}
              visitLabel={visit.label}
              profiles={profiles}
              currentUserId={currentUserId}
              surchargeRate={surchargeRate}
              suggestedAmount={Math.max(0, due)}
              remainingBefore={due}
              onCancel={() => setEditing(null)}
              onSave={async (fd, countsFor) => {
                const { celebration } = await addPayment(patientId, visit.key, fd);
                const left = round(due - countsFor);
                if (celebration?.kind === "confetti") {
                  fireConfetti();
                  if (soundEnabled) playChime();
                }
                const base = celebration?.message ?? "Payment recorded ✓";
                showToast(left > 0 ? `${base} ${fmt(left)} still due on this visit.` : base);
                setEditing(null);
                router.refresh();
              }}
            />
          </FormBox>
        )}

        {/* Balance */}
        {(owed > 0 || paid > 0) && (
          <BalanceBox due={due} dueNow={dueNow} extrasUnpaid={extrasTotal > 0 && due > 0 && due <= extrasTotal} fmt={fmt} />
        )}

        {surcharges > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            + {fmt(surcharges)} card surcharge collected on top — not counted toward commission.
          </p>
        )}
        {commissionBase != null && costs && (
          <p className="mt-2 text-xs text-slate-500">
            Commission base <span className="font-mono font-semibold text-slate-700">{fmtMain(commissionBase)}</span> ={" "}
            {payments.length ? `paid ${fmtMain(dealToMain(deal, paid))}` : `owed ${fmtMain(dealToMain(deal, owed))}`}
            {costs.hotel > 0 && ` − hotel ${fmtMain(costs.hotel)}`}
            {costs.transfers > 0 && ` − transfers ${fmtMain(costs.transfers)}`}
          </p>
        )}
      </div>
    </Section>
  );
}

function Amount({ children, bold }: { children: ReactNode; bold?: boolean }) {
  return <span className={`w-24 shrink-0 text-right font-mono ${bold ? "font-bold" : ""}`}>{children}</span>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

function FormBox({ children }: { children: ReactNode }) {
  return <div className="my-2 rounded-xl border border-teal-200 bg-teal-50/40 p-4">{children}</div>;
}

function BalanceBox({ due, dueNow, extrasUnpaid, fmt }: { due: number; dueNow: boolean; extrasUnpaid: boolean; fmt: (n: number) => string }) {
  if (due === 0) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-800">
        <CheckIcon size={18} />
        <span className="grow font-bold">Paid in full</span>
        <span className="w-24 text-right font-mono font-bold">{fmt(0)}</span>
        <span className="w-7" />
      </div>
    );
  }
  if (due < 0) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-blue-800">
        <span className="grow font-bold">Overpaid</span>
        <span className="text-xs">check the payments</span>
        <span className="w-24 text-right font-mono font-bold">{fmt(-due)}</span>
        <span className="w-7" />
      </div>
    );
  }
  if (!dueNow) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-slate-700">
        <span className="grow font-semibold">To pay at the visit</span>
        <span className="w-24 text-right font-mono font-semibold">{fmt(due)}</span>
        <span className="w-7" />
      </div>
    );
  }
  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.5" />
      </svg>
      <span className="grow font-bold">Still due</span>
      {extrasUnpaid && <span className="hidden text-xs sm:inline">extras not paid yet</span>}
      <span className="w-24 text-right font-mono font-bold">{fmt(due)}</span>
      <span className="w-7" />
    </div>
  );
}

/** The patient's deal currency (locked once a payment is recorded) and the rate it's agreed at:
 * the rate on the confirmation date, or one typed in by hand. */
function DealCurrencyForm({
  deal,
  main,
  options,
  locked,
  onCancel,
  onSave,
}: {
  deal: DealInfo;
  main: string;
  options: string[];
  locked: boolean;
  onCancel: () => void;
  onSave: (currency: string, rate: number | null) => Promise<void>;
}) {
  const [currency, setCurrency] = useState(deal.currency);
  const [manual, setManual] = useState(deal.deal_rate_source === "manual");
  const [rate, setRate] = useState(deal.currency !== main ? String(deal.deal_rate) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const foreign = currency !== main;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await onSave(currency, foreign && manual ? Number(rate) : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm font-bold text-slate-900">Deal currency</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Label>Currency</Label>
          {locked ? (
            <p className="py-2 text-sm font-semibold text-slate-800">{deal.currency}</p>
          ) : (
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </div>
        {foreign && (
          <div className="flex flex-col gap-1.5">
            <Toggle on={manual} onChange={setManual}>
              Set the rate by hand
            </Toggle>
            {manual && (
              <span className="flex items-center gap-1.5 text-sm text-slate-700">
                1 {currencySymbol(currency)} =
                <Input type="number" step="0.00000001" min="0.00000001" value={rate} onChange={(e) => setRate(e.target.value)} className="w-32" required />
                {main}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {locked
          ? "The currency is fixed now that a payment is recorded — only the rate can be corrected."
          : "Prices, extras and discounts on every visit are in this currency."}{" "}
        {foreign && !manual && "The rate is the market (or clinic) rate on the confirmation date."} Commission and reports use
        this rate, so they don&apos;t move with the markets.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function PriceForm({
  visit,
  currency,
  onCancel,
  onSave,
}: {
  visit: VisitView;
  currency: string;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(visit.expected != null ? String(visit.expected) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await onSave(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={submit} className="my-1 flex flex-wrap items-end gap-2 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
      <div className="w-40">
        <Label>Treatment price ({currencySymbol(currency)})</Label>
        <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function PaymentForm({
  payment,
  dealCurrency,
  visitLabel,
  profiles,
  currentUserId,
  surchargeRate,
  suggestedAmount,
  remainingBefore,
  onCancel,
  onSave,
}: {
  payment?: PatientPayment;
  dealCurrency: string;
  visitLabel: string;
  profiles: Profile[];
  currentUserId: string;
  surchargeRate: number;
  suggestedAmount: number;
  /** Owed − paid before this payment (new payments only) — to show what would be left. */
  remainingBefore?: number;
  onCancel: () => void;
  /** `countsFor` = what the payment counts for in the deal currency. */
  onSave: (formData: FormData, countsFor: number) => Promise<void>;
}) {
  const currencies = useCurrencies();
  const canCorrectRate = useCan("money.edit");
  const [amount, setAmount] = useState(payment ? String(payment.paid_amount) : suggestedAmount > 0 ? String(suggestedAmount) : "");
  const [currency, setCurrency] = useState(payment?.currency ?? dealCurrency);
  const [paidOn, setPaidOn] = useState(payment?.paid_on ?? todayIso());
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? "cash");
  const [surcharge, setSurcharge] = useState(payment ? payment.surcharge_rate != null : false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Rates for a payment in another currency: the saved ones while currency and date are
  // unchanged, else a preview of what the server will use. Typed-in rates win (money.edit).
  const main = currencies.main;
  const keepSaved = !!payment && payment.currency === currency && payment.paid_on === paidOn;
  const needsDeal = currency !== dealCurrency;
  const needsMain = currency !== main && dealCurrency !== main;
  const [preview, setPreview] = useState<{ key: string; toDeal: number | null; toMain: number | null } | null>(null);
  const previewKey = `${currency}|${paidOn}`;
  const [manual, setManual] = useState(payment?.rate_source === "manual" && canCorrectRate);
  const [typedDeal, setTypedDeal] = useState(payment && payment.currency !== dealCurrency ? String(payment.rate_to_deal) : "");
  const [typedMain, setTypedMain] = useState(payment && payment.currency !== main ? String(payment.rate_to_main) : "");

  useEffect(() => {
    if ((!needsDeal && !needsMain) || keepSaved || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return;
    let cancelled = false;
    previewPaymentRates(dealCurrency, currency, paidOn)
      .then((r) => !cancelled && setPreview({ key: previewKey, toDeal: r.toDeal, toMain: r.toMain }))
      .catch(() => !cancelled && setPreview({ key: previewKey, toDeal: null, toMain: null }));
    return () => {
      cancelled = true;
    };
  }, [currency, paidOn, dealCurrency, needsDeal, needsMain, keepSaved, previewKey]);

  const auto = keepSaved
    ? { toDeal: payment!.rate_to_deal, toMain: payment!.rate_to_main }
    : preview?.key === previewKey
    ? preview
    : null;
  const toDeal = !needsDeal ? 1 : manual && Number(typedDeal) > 0 ? Number(typedDeal) : auto?.toDeal ?? null;
  const loadingRate = needsDeal && toDeal == null && !manual && preview?.key !== previewKey;

  const amountNum = Number(amount) || 0;
  const countsFor = toDeal != null ? round(amountNum * toDeal) : 0;
  const surchargeAmount = method === "card" && surcharge ? round(amountNum * surchargeRate) : 0;
  const left = remainingBefore != null && toDeal != null ? round(remainingBefore - countsFor) : null;
  const fmtPaid = moneyIn(currency);
  const fmtDeal = moneyIn(dealCurrency);
  const options = currencies.list.includes(dealCurrency) ? currencies.list : [...currencies.list, dealCurrency];
  const showCurrency = options.length > 1 || currency !== dealCurrency;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(formData, countsFor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const team = profiles.filter((p) => p.is_active || p.id === payment?.received_by);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-bold text-slate-900">{payment ? "Edit payment" : "Record payment"}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_auto_10rem_minmax(0,1fr)] sm:items-end">
        <div>
          <Label>Amount ({currencySymbol(currency)})</Label>
          <Input type="number" name="amount" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        <div>
          <Label>Method</Label>
          <Segmented
            name="method"
            value={method}
            onChange={setMethod}
            options={[
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
              { value: "bank", label: "Bank" },
            ]}
          />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" name="paid_on" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
        </div>
        <div>
          <Label>Received by</Label>
          <Select name="received_by" defaultValue={payment?.received_by ?? currentUserId}>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || "Unnamed"}
                {p.id === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showCurrency ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Paid in</span>
            <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-auto" aria-label="Currency paid in">
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </span>
          {needsDeal && (
            <span className="text-xs text-slate-600">
              {loadingRate
                ? "Getting the rate…"
                : toDeal == null
                ? "No rate for that date yet — enter it by hand."
                : `Counts as ${fmtDeal(countsFor)} toward this visit (${rateLabel(currency, dealCurrency, toDeal)})`}
            </span>
          )}
          {!needsDeal && currency !== main && auto?.toMain && (
            <span className="text-xs text-slate-500">≈ {moneyIn(main)(round(amountNum * auto.toMain))} in reports</span>
          )}
          {(needsDeal || needsMain) && canCorrectRate && (
            <Toggle on={manual} onChange={setManual}>
              Set the rate by hand
            </Toggle>
          )}
        </div>
      ) : (
        <input type="hidden" name="currency" value={currency} />
      )}
      {manual && (needsDeal || needsMain) && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-700">
          {needsDeal && (
            <span className="flex items-center gap-1.5">
              1 {currencySymbol(currency)} =
              <Input type="number" name="rate_to_deal" step="0.00000001" min="0.00000001" value={typedDeal} onChange={(e) => setTypedDeal(e.target.value)} className="w-32" required />
              {dealCurrency}
            </span>
          )}
          {needsMain && (
            <span className="flex items-center gap-1.5">
              1 {currencySymbol(currency)} =
              <Input type="number" name="rate_to_main" step="0.00000001" min="0.00000001" value={typedMain} onChange={(e) => setTypedMain(e.target.value)} className="w-32" required />
              {main} (for reports)
            </span>
          )}
        </div>
      )}

      {method === "card" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Toggle name="surcharge" on={surcharge} onChange={setSurcharge}>
            Patient pays the {pct(surchargeRate)} card surcharge on top
          </Toggle>
          {surcharge && amountNum > 0 && (
            <span className="text-xs text-slate-500">
              Patient pays {fmtPaid(amountNum + surchargeAmount)} · {fmtPaid(surchargeAmount)} surcharge not commissioned
            </span>
          )}
        </div>
      )}
      <div>
        <Label>Note</Label>
        <Input name="note" defaultValue={payment?.note ?? ""} placeholder="Receipt no., balance on departure…" />
      </div>

      {left != null && amountNum > 0 && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            left > 0 ? "bg-amber-50 text-amber-800" : left < 0 ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {left === 0 && <CheckIcon size={16} />}
          {left > 0
            ? `After this payment: ${fmtDeal(left)} still due on ${visitLabel.toLowerCase()}.`
            : left < 0
            ? `This is ${fmtDeal(-left)} more than owed (overpaid).`
            : `This pays ${visitLabel.toLowerCase()} in full.`}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || loadingRate}>
          {pending ? "Saving…" : payment ? "Save payment" : amountNum > 0 ? `Record ${fmtPaid(amountNum)}` : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

function ExtraForm({
  extra,
  currency,
  hotel,
  onCancel,
  onSave,
}: {
  extra?: PatientExtra;
  currency: string;
  hotel: string | null;
  onCancel: () => void;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<PatientExtraKind>(extra?.kind ?? "treatment");
  const [quantity, setQuantity] = useState(String(extra?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(extra?.unit_price != null ? String(extra.unit_price) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const sym = currencySymbol(currency);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{extra ? "Edit extra" : "Add an extra"}</p>
        <Segmented
          name="kind"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: "treatment", label: "Treatment" },
            { value: "night", label: "Hotel night(s)" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem]">
        <div className="col-span-2 sm:col-span-1">
          <Label>Description</Label>
          <Input
            name="description"
            defaultValue={extra?.description ?? ""}
            placeholder={kind === "night" ? hotel || "Hotel name / dates" : kind === "treatment" ? "Sinus lift" : "Airport VIP lounge"}
            autoFocus
          />
        </div>
        <div>
          <Label>{kind === "night" ? "Nights" : "Quantity"}</Label>
          <Input type="number" name="quantity" min="0.01" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div>
          <Label>{kind === "night" ? `Per night (${sym})` : `Unit price (${sym})`}</Label>
          <Input type="number" name="unit_price" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-slate-600">
          Adds <span className="font-mono font-semibold text-slate-900">{moneyIn(currency)(lineTotal)}</span> to what’s owed
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : extra ? "Save extra" : "Add extra"}
        </Button>
      </div>
    </form>
  );
}

function DiscountForm({
  discount,
  currency,
  onCancel,
  onSave,
}: {
  discount: VisitDiscountSetting | null;
  currency: string;
  onCancel: () => void;
  onSave: (fd: FormData) => Promise<void>;
}) {
  const [type, setType] = useState<"amount" | "percent">(discount?.type ?? "amount");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sym = currencySymbol(currency);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          name="discount_type"
          value={type}
          onChange={setType}
          size="sm"
          options={[
            { value: "amount", label: `${sym} amount` },
            { value: "percent", label: "% of total" },
          ]}
        />
        <div className="w-32">
          <Label>{type === "percent" ? "Percent" : `Amount (${sym})`}</Label>
          <Input
            type="number"
            name="discount_value"
            min="0"
            max={type === "percent" ? 100 : undefined}
            step="0.01"
            defaultValue={discount?.value ?? ""}
            required
            autoFocus
          />
        </div>
      </div>
      <div>
        <Label>Reason (optional)</Label>
        <Input name="discount_reason" maxLength={200} defaultValue={discount?.reason ?? ""} placeholder="e.g. returning patient" />
      </div>
      <p className="text-xs text-slate-500">Comes off this visit&apos;s price + extras. Recorded in the patient&apos;s history.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save discount"}
        </Button>
      </div>
    </form>
  );
}
