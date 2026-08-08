"use client";

import { useState, useTransition } from "react";
import { CommissionSettings, Patient } from "@/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { downloadCsv, patientsToCsv } from "@/lib/csv";
import { saveSettings } from "./actions";

const CURRENCIES = ["GBP", "USD", "EUR", "TRY"];

export function SettingsClient({
  settings,
  patients,
}: {
  settings: CommissionSettings;
  patients: Patient[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveSettings(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleExport() {
    const csv = patientsToCsv(patients);
    downloadCsv(`patients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Commission rules, currency and data export.</p>
      </div>

      <Card className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Commission tiers</h2>
        <p className="mb-5 text-sm text-slate-500">
          Applied to the full monthly total, not marginal — whichever tier the month's total falls
          into, that rate applies to the whole total. Plus a fixed payment added every month.
        </p>

        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tier 1 threshold (£, up to)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                name="tier1_threshold"
                defaultValue={settings.tier1_threshold}
                required
              />
            </div>
            <div>
              <Label>Tier 1 rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="tier1_rate"
                defaultValue={(settings.tier1_rate * 100).toString()}
                required
              />
            </div>
            <div>
              <Label>Tier 2 threshold (£, up to)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                name="tier2_threshold"
                defaultValue={settings.tier2_threshold}
                required
              />
            </div>
            <div>
              <Label>Tier 2 rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="tier2_rate"
                defaultValue={(settings.tier2_rate * 100).toString()}
                required
              />
            </div>
            <div>
              <Label>Tier 3 rate (%, above tier 2)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="tier3_rate"
                defaultValue={(settings.tier3_rate * 100).toString()}
                required
              />
            </div>
            <div>
              <Label>Fixed monthly payment (£)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                name="fixed_monthly_payment"
                defaultValue={settings.fixed_monthly_payment}
                required
              />
            </div>
          </div>

          <div>
            <Label>Currency display</Label>
            <Select name="currency" defaultValue={settings.currency}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Data export</h2>
        <p className="mb-4 text-sm text-slate-500">
          Download all {patients.length} patient records as a CSV file.
        </p>
        <Button variant="secondary" onClick={handleExport}>
          Export patients CSV
        </Button>
      </Card>
    </div>
  );
}
