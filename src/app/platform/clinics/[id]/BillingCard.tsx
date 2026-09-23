"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_CURRENCIES, ClinicBilling, Plan, PLAN_LABELS, PLANS } from "@/lib/clinic-billing";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { updateClinicBilling } from "../../actions";

/** Superadmin-only record of what the clinic is on. Nothing here is visible to the clinic,
 * and no payment is taken. */
export function BillingCard({
  clinicId,
  billing,
  activeAccounts,
}: {
  clinicId: string;
  billing: ClinicBilling | null;
  activeAccounts: number;
}) {
  const [plan, setPlan] = useState<Plan>(billing?.plan ?? "trial");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateClinicBilling(clinicId, new FormData(e.currentTarget));
      showToast("Plan saved ✓");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-fit p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Plan &amp; billing</h2>
        {!billing && <span className="text-xs text-slate-400">No plan recorded yet</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">Only superadmins see this. Record-keeping only, no payments are taken.</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Plan</Label>
            <Select name="plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Seat limit</Label>
            <Input
              name="seat_limit"
              type="number"
              min={1}
              step={1}
              defaultValue={billing?.seatLimit ?? ""}
              placeholder="Unlimited"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          {activeAccounts} active account{activeAccounts === 1 ? "" : "s"} now. At the limit, the clinic can&apos;t add or
          reactivate anyone.
        </p>

        {plan === "trial" && (
          <div>
            <Label>Trial ends</Label>
            <Input name="trial_ends_at" type="date" defaultValue={billing?.trialEndsAt ?? ""} />
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label>Monthly price</Label>
            <Input
              name="monthly_price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={billing?.monthlyPrice ?? ""}
              placeholder="Not set"
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Select name="currency" defaultValue={billing?.currency ?? "EUR"}>
              {BILLING_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Private notes</Label>
          <Textarea
            name="notes"
            rows={3}
            defaultValue={billing?.notes ?? ""}
            placeholder="e.g. agreed 3 months free, invoice to accounting@…"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save plan"}
        </Button>
      </form>
    </Card>
  );
}
