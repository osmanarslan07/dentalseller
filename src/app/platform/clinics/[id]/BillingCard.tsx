"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_CURRENCIES, ClinicBilling, Plan, PLAN_LABELS, PLAN_MODULES, PLANS } from "@/lib/clinic-billing";
import { CLINIC_MODULES, ClinicModule, MODULE_LABELS } from "@/types";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { updateClinicBilling } from "../../actions";

/** Superadmin-only record of what the clinic is on. Nothing here is visible to the clinic,
 * and no payment is taken. */
export function BillingCard({
  clinicId,
  billing,
  modules: savedModules,
  activeAccounts,
}: {
  clinicId: string;
  billing: ClinicBilling | null;
  modules: ClinicModule[];
  activeAccounts: number;
}) {
  const [plan, setPlan] = useState<Plan>(billing?.plan ?? "trial");
  const [modules, setModules] = useState<ClinicModule[]>(savedModules);

  function choosePlan(next: Plan) {
    setPlan(next);
    // a plan prefills its modules; Custom keeps whatever is ticked
    const preset = PLAN_MODULES[next];
    if (preset) setModules(preset);
  }
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
            <Select name="plan" value={plan} onChange={(e) => choosePlan(e.target.value as Plan)}>
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

        <fieldset>
          <Label>Modules</Label>
          <div className="mt-1 flex flex-col gap-1.5">
            {CLINIC_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="modules"
                  value={m}
                  checked={modules.includes(m)}
                  onChange={(e) => setModules((ms) => (e.target.checked ? [...ms, m] : ms.filter((x) => x !== m)))}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                {MODULE_LABELS[m]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Patients, payments, tasks, files, team and settings are always on. Choosing a plan fills these in; change
            them by hand if needed.
          </p>
        </fieldset>

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
