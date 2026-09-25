"use client";

import { DateInput } from "@/components/DateInput";
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
import { useLang, useLocale, useT } from "@/i18n/client";

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
  const t = useT();
  const lang = useLang();
  const locale = useLocale();
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
        showToast(e instanceof Error ? e.message : t("Something went wrong"), "error");
      }
    });
  }

  function deleteExtra(e: PatientExtra) {
    if (!confirm(t("Delete {what}?", { what: extraLabel(e, lang) }))) return;
    run(() => deletePatientExtra(e.id), t("Extra deleted"));
  }

  function deletePaymentRow(p: PatientPayment) {
    if (!confirm(t("Delete the {amount} {method} payment?", { amount: moneyIn(p.currency)(p.paid_amount), method: t(METHOD_LABELS[p.method]).toLocaleLowerCase(locale) }))) return;
    run(() => deletePayment(p.id), t("Payment deleted"));
  }

  // commission is worked out in the main currency (at the agreed rate), after the clinic's costs
  const commissionBase =
    costs && costs.hotel + costs.transfers > 0
      ? Math.max(0, dealToMain(deal, payments.length ? paid : owed) - costs.hotel - costs.transfers)
      : null;
  const surcharges = round(payments.reduce((s, p) => s + p.surcharge_amount, 0));

  return (
    <Section
      title={t("Money")}
      actions={
        <>
          {canExtras && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing({ type: "extra", id: null })}>
              + {t("Extra")}
            </Button>
          )}
          {canPay && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing({ type: "payment", id: null })}>
              + {t("Record payment")}
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
                  showToast(t("Deal currency saved ✓"));
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                {t("Prices in")} <span className="font-semibold text-slate-900">{deal.currency}</span>
              </span>
              {foreign && (
                <span>
                  · {rateLabel(deal.currency, main, deal.deal_rate)}
                  {deal.deal_rate_source && ` (${t(RATE_SOURCE_LABELS[deal.deal_rate_source])}`}
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
                  {t("Change")}
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
              showToast(t("Price saved ✓"));
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex items-center gap-2.5 py-2">
            <span className="grow font-semibold">{t("Treatment price")}</span>
            {visit.expected == null ? (
              <span className="text-xs text-slate-500">{t("not agreed yet")}</span>
            ) : (
              visit.kind === "main" && <span className="hidden text-xs text-slate-500 sm:inline">{t("agreed by {name}", { name: sellerName })}</span>
            )}
            <Amount>{visit.expected == null ? "—" : fmt(visit.expected)}</Amount>
            {canPrice && (
              <IconButton label={t("Edit price")} onClick={() => setEditing({ type: "price" })}>
                <PencilIcon />
              </IconButton>
            )}
          </div>
        )}

        {/* Extras */}
        <span className={`${LABEL_CAPS} pt-2`}>{t("Extras")}</span>
        {extras.length === 0 && editing?.type !== "extra" && <span className="py-2 text-[13px] text-slate-500">{t("None yet")}</span>}
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
                  showToast(t("Extra saved ✓"));
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div key={e.id} className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
              <Pill tone={KIND_TONES[e.kind]} small>
                {t(KIND_LABELS[e.kind])}
              </Pill>
              <span className="min-w-0 grow truncate">{e.description || extraLabel(e, lang)}</span>
              <span className="hidden text-xs text-slate-500 sm:inline">
                {e.quantity} × {fmt(e.unit_price)}
              </span>
              <Amount>+ {fmt(e.total)}</Amount>
              {canExtras && <RowMenu
                label={t("Extra actions")}
                items={[
                  { label: t("Edit"), onSelect: () => setEditing({ type: "extra", id: e.id }) },
                  { label: t("Delete extra…"), danger: true, divider: true, disabled: pending, onSelect: () => deleteExtra(e) },
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
                showToast(t("Extra added ✓"));
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
                showToast(String(fd.get("discount_value") ?? "").trim() ? t("Discount saved ✓") : t("Discount removed"));
                setEditing(null);
                router.refresh();
              }}
            />
          </FormBox>
        ) : discount ? (
          <div className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
            <span className="grow">
              <span className="font-semibold">{t("Discount")}</span>
              {discount.type === "percent" && <span className="ml-1.5 text-xs text-slate-500">{discount.value}%</span>}
              {discount.reason && <span className="block truncate text-xs text-slate-500">{discount.reason}</span>}
            </span>
            <Amount>− {fmt(discountOff)}</Amount>
            {canPrice ? (
              <RowMenu
                label={t("Discount actions")}
                items={[
                  { label: t("Edit"), onSelect: () => setEditing({ type: "discount" }) },
                  {
                    label: t("Remove discount…"),
                    danger: true,
                    divider: true,
                    disabled: pending,
                    onSelect: () => {
                      if (!confirm(t("Remove the discount on this visit?"))) return;
                      const fd = new FormData();
                      run(() => setVisitDiscount(patientId, visit.key, fd), t("Discount removed"));
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
              + {t("Discount")}
            </button>
          )
        )}

        {/* Owed */}
        <div className="mt-1.5 flex items-center gap-2.5 border-t-2 border-slate-900 py-2.5">
          <span className="grow font-bold">
            {t("Owed for this visit")}
            {foreign && owed > 0 && (
              <span className="block text-xs font-normal text-slate-500">{t("≈ {amount} at the agreed rate", { amount: fmtMain(dealToMain(deal, owed)) })}</span>
            )}
          </span>
          <Amount bold>{fmt(owed)}</Amount>
          <span className="w-7" />
        </div>

        {/* Payments */}
        <span className={`${LABEL_CAPS} pt-1.5`}>{t("Payments")}</span>
        {payments.length === 0 && editing?.type !== "payment" && (
          <span className="py-2 text-[13px] text-slate-500">
            {dueNow || owed === 0 ? t("Nothing recorded yet.") : t("Nothing collected — not due until the visit starts.")}
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
                  showToast(t("Payment saved ✓"));
                  setEditing(null);
                  router.refresh();
                }}
              />
            </FormBox>
          ) : (
            <div key={p.id} className="flex items-center gap-2.5 border-b border-dashed border-slate-100 py-2">
              <Pill tone={METHOD_TONES[p.method]} small>
                {t(METHOD_LABELS[p.method])}
              </Pill>
              <span className="min-w-0 grow">
                {shortDate(p.paid_on, false, locale)} <span className="text-slate-500">· {t("received by {name}", { name: nameOf(p.received_by) })}</span>
                {p.currency !== deal.currency && (
                  <span className="block text-xs text-slate-500">
                    {t("Paid {amount} at {rate}", { amount: moneyIn(p.currency)(p.paid_amount), rate: rateLabel(p.currency, deal.currency, p.rate_to_deal) })}
                    {p.rate_source === "manual" && ` (${t("set by hand")})`}
                  </span>
                )}
                {p.note && <span className="block truncate text-xs text-slate-500 sm:hidden">{p.note}</span>}
              </span>
              <span className="hidden max-w-[40%] truncate text-xs text-slate-500 sm:inline">
                {[p.note, p.surcharge_amount > 0 ? t("+ {amount} surcharge ({pct})", { amount: fmt(p.surcharge_amount), pct: pct(p.surcharge_rate ?? 0) }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <Amount>− {fmt(p.amount)}</Amount>
              {canEditPayments && <RowMenu
                label={t("Payment actions")}
                items={[
                  { label: t("Edit"), onSelect: () => setEditing({ type: "payment", id: p.id }) },
                  { label: t("Delete payment…"), danger: true, divider: true, disabled: pending, onSelect: () => deletePaymentRow(p) },
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
                const base = celebration?.message ?? t("Payment recorded ✓");
                showToast(left > 0 ? `${base} ${t("{amount} still due on this visit.", { amount: fmt(left) })}` : base);
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
            {t("+ {amount} card surcharge collected on top — not counted toward commission.", { amount: fmt(surcharges) })}
          </p>
        )}
        {commissionBase != null && costs && (
          <p className="mt-2 text-xs text-slate-500">
            {t("Commission base")} <span className="font-mono font-semibold text-slate-700">{fmtMain(commissionBase)}</span> ={" "}
            {payments.length ? `${t("paid")} ${fmtMain(dealToMain(deal, paid))}` : `${t("owed")} ${fmtMain(dealToMain(deal, owed))}`}
            {costs.hotel > 0 && ` − ${t("hotel")} ${fmtMain(costs.hotel)}`}
            {costs.transfers > 0 && ` − ${t("transfers")} ${fmtMain(costs.transfers)}`}
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
  const t = useT();
  if (due === 0) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-800">
        <CheckIcon size={18} />
        <span className="grow font-bold">{t("Paid in full")}</span>
        <span className="w-24 text-right font-mono font-bold">{fmt(0)}</span>
        <span className="w-7" />
      </div>
    );
  }
  if (due < 0) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-blue-800">
        <span className="grow font-bold">{t("Overpaid")}</span>
        <span className="text-xs">{t("check the payments")}</span>
        <span className="w-24 text-right font-mono font-bold">{fmt(-due)}</span>
        <span className="w-7" />
      </div>
    );
  }
  if (!dueNow) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-slate-700">
        <span className="grow font-semibold">{t("To pay at the visit")}</span>
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
      <span className="grow font-bold">{t("Still due")}</span>
      {extrasUnpaid && <span className="hidden text-xs sm:inline">{t("extras not paid yet")}</span>}
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
  const t = useT();
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
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm font-bold text-slate-900">{t("Deal currency")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Label>{t("Currency")}</Label>
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
              {t("Set the rate by hand")}
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
          ? t("The currency is fixed now that a payment is recorded — only the rate can be corrected.")
          : t("Prices, extras and discounts on every visit are in this currency.")}{" "}
        {foreign && !manual && `${t("The rate is the market (or clinic) rate on the confirmation date.")} `}
        {t("Commission and reports use this rate, so they don't move with the markets.")}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("Saving…") : t("Save")}
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
  const t = useT();
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
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="my-1 flex flex-wrap items-end gap-2 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
      <div className="w-40">
        <Label>{t("Treatment price ({sym})", { sym: currencySymbol(currency) })}</Label>
        <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        {t("Cancel")}
      </Button>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("Saving…") : t("Save")}
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
  const t = useT();
  const locale = useLocale();
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
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  const team = profiles.filter((p) => p.is_active || p.id === payment?.received_by);
  const visitName = t(visitLabel).toLocaleLowerCase(locale);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-bold text-slate-900">{payment ? t("Edit payment") : t("Record payment")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_auto_10rem_minmax(0,1fr)] sm:items-end">
        <div>
          <Label>{t("Amount ({sym})", { sym: currencySymbol(currency) })}</Label>
          <Input type="number" name="amount" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        <div>
          <Label>{t("Method")}</Label>
          <Segmented
            name="method"
            value={method}
            onChange={setMethod}
            options={[
              { value: "cash", label: t("Cash") },
              { value: "card", label: t("Card") },
              { value: "bank", label: t("Bank") },
            ]}
          />
        </div>
        <div>
          <Label>{t("Date")}</Label>
          <DateInput name="paid_on" value={paidOn} onChange={setPaidOn} required />
        </div>
        <div>
          <Label>{t("Received by")}</Label>
          <Select name="received_by" defaultValue={payment?.received_by ?? currentUserId}>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || t("Unnamed")}
                {p.id === currentUserId ? ` ${t("(you)")}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showCurrency ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{t("Paid in")}</span>
            <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-auto" aria-label={t("Currency paid in")}>
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
                ? t("Getting the rate…")
                : toDeal == null
                ? t("No rate for that date yet — enter it by hand.")
                : t("Counts as {amount} toward this visit ({rate})", { amount: fmtDeal(countsFor), rate: rateLabel(currency, dealCurrency, toDeal) })}
            </span>
          )}
          {!needsDeal && currency !== main && auto?.toMain && (
            <span className="text-xs text-slate-500">{t("≈ {amount} in reports", { amount: moneyIn(main)(round(amountNum * auto.toMain)) })}</span>
          )}
          {(needsDeal || needsMain) && canCorrectRate && (
            <Toggle on={manual} onChange={setManual}>
              {t("Set the rate by hand")}
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
              {main} ({t("for reports")})
            </span>
          )}
        </div>
      )}

      {method === "card" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Toggle name="surcharge" on={surcharge} onChange={setSurcharge}>
            {t("Patient pays the {pct} card surcharge on top", { pct: pct(surchargeRate) })}
          </Toggle>
          {surcharge && amountNum > 0 && (
            <span className="text-xs text-slate-500">
              {t("Patient pays {total} · {surcharge} surcharge not commissioned", { total: fmtPaid(amountNum + surchargeAmount), surcharge: fmtPaid(surchargeAmount) })}
            </span>
          )}
        </div>
      )}
      <div>
        <Label>{t("Note")}</Label>
        <Input name="note" defaultValue={payment?.note ?? ""} placeholder={t("Receipt no., balance on departure…")} />
      </div>

      {left != null && amountNum > 0 && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            left > 0 ? "bg-amber-50 text-amber-800" : left < 0 ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {left === 0 && <CheckIcon size={16} />}
          {left > 0
            ? t("After this payment: {amount} still due on {visit}.", { amount: fmtDeal(left), visit: visitName })
            : left < 0
            ? t("This is {amount} more than owed (overpaid).", { amount: fmtDeal(-left) })
            : t("This pays {visit} in full.", { visit: visitName })}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending || loadingRate}>
          {pending ? t("Saving…") : payment ? t("Save payment") : amountNum > 0 ? t("Record {amount}", { amount: fmtPaid(amountNum) }) : t("Record payment")}
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
  const t = useT();
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
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{extra ? t("Edit extra") : t("Add an extra")}</p>
        <Segmented
          name="kind"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: "treatment", label: t("Treatment") },
            { value: "night", label: t("Hotel night(s)") },
            { value: "other", label: t("Other") },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem]">
        <div className="col-span-2 sm:col-span-1">
          <Label>{t("Description")}</Label>
          <Input
            name="description"
            defaultValue={extra?.description ?? ""}
            placeholder={kind === "night" ? hotel || t("Hotel name / dates") : kind === "treatment" ? t("Sinus lift") : t("Airport VIP lounge")}
            autoFocus
          />
        </div>
        <div>
          <Label>{kind === "night" ? t("Nights") : t("Quantity")}</Label>
          <Input type="number" name="quantity" min="0.01" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div>
          <Label>{kind === "night" ? t("Per night ({sym})", { sym }) : t("Unit price ({sym})", { sym })}</Label>
          <Input type="number" name="unit_price" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-slate-600">
          {t("Adds {amount} to what’s owed", { amount: moneyIn(currency)(lineTotal) })}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("Saving…") : extra ? t("Save extra") : t("Add extra")}
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
  const t = useT();
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
        setError(err instanceof Error ? err.message : t("Something went wrong"));
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
            { value: "amount", label: t("{sym} amount", { sym }) },
            { value: "percent", label: t("% of total") },
          ]}
        />
        <div className="w-32">
          <Label>{type === "percent" ? t("Percent") : t("Amount ({sym})", { sym })}</Label>
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
        <Label>{t("Reason (optional)")}</Label>
        <Input name="discount_reason" maxLength={200} defaultValue={discount?.reason ?? ""} placeholder={t("e.g. returning patient")} />
      </div>
      <p className="text-xs text-slate-500">{t("Comes off this visit's price + extras. Recorded in the patient's history.")}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("Saving…") : t("Save discount")}
        </Button>
      </div>
    </form>
  );
}
