"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCelebrationSound } from "@/components/celebration-sound";
import { fireConfetti, playChime } from "@/lib/celebrate";
import { formatCurrency, formatDate } from "@/lib/format";
import { PatientPayment, PaymentMethod, Profile } from "@/types";
import { addPayment, deletePayment, updatePayment } from "./payment-actions";

const METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", bank: "Bank transfer" };
const gbp = (n: number) => formatCurrency(n, "GBP");
const pct = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Owed vs paid for one visit — "Balance due", "Paid in full" or "Overpaid". */
export function BalanceLine({ expected, extras, paid }: { expected: number | null; extras: number; paid: number }) {
  const owed = (expected ?? 0) + extras;
  const diff = Math.round((owed - paid) * 100) / 100;
  if (owed === 0 && paid === 0) return <p className="text-sm text-slate-400">No price agreed yet.</p>;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-slate-600">
        Owed <span className="font-semibold text-slate-900">{gbp(owed)}</span>
        {extras > 0 && (
          <span className="text-xs text-slate-400">
            {" "}
            ({gbp(expected ?? 0)} + {gbp(extras)} extras)
          </span>
        )}
      </span>
      <span className="text-slate-600">
        Paid <span className="font-semibold text-slate-900">{gbp(paid)}</span>
      </span>
      {diff > 0 ? (
        <Badge tone="amber">{gbp(diff)} due</Badge>
      ) : diff < 0 ? (
        <Badge tone="blue">Overpaid {gbp(-diff)}</Badge>
      ) : (
        <Badge tone="green">Paid in full</Badge>
      )}
    </div>
  );
}

export function PaymentsSection({
  patientId,
  visitKey,
  payments,
  expected,
  extrasTotal,
  profiles,
  currentUserId,
  surchargeRate,
  costs = null,
  compact = false,
}: {
  patientId: string;
  visitKey: string;
  payments: PatientPayment[];
  /** The visit's agreed treatment price. */
  expected: number | null;
  extrasTotal: number;
  profiles: Profile[];
  currentUserId: string;
  /** The clinic's card surcharge, e.g. 0.03. */
  surchargeRate: number;
  /** The visit's costs — set only when the clinic deducts them before commission. */
  costs?: { hotel: number; transfers: number } | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const surcharges = payments.reduce((s, p) => s + p.surcharge_amount, 0);
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name || "—";

  function handleDelete(p: PatientPayment) {
    if (!confirm(`Delete the ${gbp(p.amount)} ${METHOD_LABELS[p.method].toLowerCase()} payment?`)) return;
    startTransition(async () => {
      try {
        await deletePayment(p.id);
        showToast("Payment deleted");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete", "error");
      }
    });
  }

  const body = (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className={compact ? "text-sm font-semibold text-slate-700" : "text-base font-semibold text-slate-900"}>
            Payments
          </h3>
          <BalanceLine expected={expected} extras={extrasTotal} paid={paid} />
          {costs && costs.hotel + costs.transfers > 0 && (
            <p className="text-xs text-slate-500">
              Commission base {gbp(Math.max(0, (payments.length ? paid : (expected ?? 0) + extrasTotal) - costs.hotel - costs.transfers))}
              {" = "}
              {payments.length ? "paid" : "expected"} − {costs.hotel > 0 && `hotel ${gbp(costs.hotel)}`}
              {costs.hotel > 0 && costs.transfers > 0 && " − "}
              {costs.transfers > 0 && `transfers ${gbp(costs.transfers)}`}
            </p>
          )}
          {surcharges > 0 && (
            <p className="text-xs text-slate-400">+ {gbp(surcharges)} card surcharge collected (not counted toward commission)</p>
          )}
        </div>
        {!adding && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            + Record payment
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <PaymentForm
            profiles={profiles}
            currentUserId={currentUserId}
            surchargeRate={surchargeRate}
            suggestedAmount={Math.max(0, (expected ?? 0) + extrasTotal - paid)}
            onCancel={() => setAdding(false)}
            onSave={async (formData) => {
              const { celebration } = await addPayment(patientId, visitKey, formData);
              if (celebration) {
                if (celebration.kind === "confetti") {
                  fireConfetti();
                  if (soundEnabled) playChime();
                }
                showToast(celebration.message);
              } else {
                showToast("Payment recorded ✓");
              }
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {payments.length === 0 && !adding ? (
        <p className="text-sm text-slate-400">No payments recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {payments.map((p) =>
            editingId === p.id ? (
              <li key={p.id} className="py-2">
                <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                  <PaymentForm
                    payment={p}
                    profiles={profiles}
                    currentUserId={currentUserId}
                    surchargeRate={p.surcharge_rate ?? surchargeRate}
                    suggestedAmount={p.amount}
                    onCancel={() => setEditingId(null)}
                    onSave={async (formData) => {
                      await updatePayment(p.id, formData);
                      showToast("Payment saved ✓");
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                </div>
              </li>
            ) : (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{gbp(p.amount)}</span>
                    <Badge tone={p.method === "cash" ? "green" : p.method === "card" ? "blue" : "slate"}>
                      {METHOD_LABELS[p.method]}
                    </Badge>
                    {p.surcharge_amount > 0 && (
                      <span className="text-xs text-slate-500">
                        + {gbp(p.surcharge_amount)} surcharge ({pct(p.surcharge_rate ?? 0)}) · patient paid{" "}
                        {gbp(p.amount + p.surcharge_amount)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {formatDate(p.paid_on)} · received by {nameOf(p.received_by)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(p.id);
                      setAdding(false);
                    }}
                    className="text-teal-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={pending}
                    className="text-slate-400 hover:text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </>
  );

  return compact ? <div className="mt-3 border-t border-slate-100 pt-3">{body}</div> : <Card className="p-5">{body}</Card>;
}

function PaymentForm({
  payment,
  profiles,
  currentUserId,
  surchargeRate,
  suggestedAmount,
  onCancel,
  onSave,
}: {
  payment?: PatientPayment;
  profiles: Profile[];
  currentUserId: string;
  surchargeRate: number;
  suggestedAmount: number;
  onCancel: () => void;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [amount, setAmount] = useState(payment ? String(payment.amount) : suggestedAmount > 0 ? String(suggestedAmount) : "");
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? "cash");
  const [surcharge, setSurcharge] = useState(payment ? payment.surcharge_rate != null : false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amountNum = Number(amount) || 0;
  const surchargeAmount = method === "card" && surcharge ? Math.round(amountNum * surchargeRate * 100) / 100 : 0;

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

  const team = profiles.filter((p) => p.is_active || p.id === payment?.received_by);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>Amount (£)</Label>
          <Input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <Label>Method</Label>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank transfer</option>
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" name="paid_on" defaultValue={payment?.paid_on ?? todayIso()} required />
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
        {method === "card" && (
          <div className="col-span-2 sm:col-span-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="surcharge"
                checked={surcharge}
                onChange={(e) => setSurcharge(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
              />
              Patient pays the {pct(surchargeRate)} card surcharge on top
            </label>
            {surcharge && amountNum > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Patient pays {gbp(amountNum + surchargeAmount)} — {gbp(amountNum)} treatment + {gbp(surchargeAmount)}{" "}
                surcharge. Only the {gbp(amountNum)} counts toward commission.
              </p>
            )}
          </div>
        )}
        <div className="col-span-2 sm:col-span-4">
          <Label>Note</Label>
          <Input name="note" defaultValue={payment?.note ?? ""} placeholder="Receipt no., deposit, balance…" />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : payment ? "Save payment" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
