"use client";

import { ChangeEvent, useState, useTransition } from "react";
import { CommissionSettings, Patient } from "@/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { downloadCsv, patientsToCsv } from "@/lib/csv";
import { PrivacyToggleButton, usePrivacy } from "@/components/privacy";
import { DASHBOARD_CARDS, DashboardCardId } from "@/lib/dashboard-cards";
import { DashboardCardsPicker } from "@/components/DashboardCardsPicker";
import { ExchangeRatePoint } from "@/lib/data";
import { RateHistoryChart } from "@/components/RateHistoryChart";
import { saveClinicBranding, saveDashboardCards, saveSettings } from "./actions";

const CURRENCIES = ["GBP", "USD", "EUR", "TRY"];

export function SettingsClient({
  settings,
  patients,
  rateHistory,
}: {
  settings: CommissionSettings;
  patients: Patient[];
  rateHistory: ExchangeRatePoint[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cardsPending, startCardsTransition] = useTransition();
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsSaved, setCardsSaved] = useState(false);
  const [brandingPending, startBrandingTransition] = useTransition();
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.clinic_logo_url);
  const { hidden, tryRate } = usePrivacy();

  const knownCardIds = new Set<DashboardCardId>(DASHBOARD_CARDS.map((c) => c.id));
  const savedOrder = settings.dashboard_cards.filter((id) => knownCardIds.has(id));
  const cardsInitialOrder = [
    ...savedOrder,
    ...DASHBOARD_CARDS.map((c) => c.id).filter((id) => !savedOrder.includes(id)),
  ];
  const cardsInitialEnabled = new Set(savedOrder);

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

  function handleCardsSubmit(formData: FormData) {
    setCardsError(null);
    setCardsSaved(false);
    startCardsTransition(async () => {
      try {
        await saveDashboardCards(formData);
        setCardsSaved(true);
        setTimeout(() => setCardsSaved(false), 2500);
      } catch (e) {
        setCardsError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleBrandingSubmit(formData: FormData) {
    setBrandingError(null);
    setBrandingSaved(false);
    startBrandingTransition(async () => {
      try {
        await saveClinicBranding(formData);
        setBrandingSaved(true);
        setTimeout(() => setBrandingSaved(false), 2500);
      } catch (e) {
        setBrandingError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
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

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="show_try"
              defaultChecked={settings.show_try}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
            />
            Show approx. Turkish Lira (₺) alongside earnings figures
          </label>
          <p className="text-xs text-slate-400">
            {settings.show_try && settings.currency !== "TRY" && tryRate
              ? `Current rate: 1 ${settings.currency} ≈ ${tryRate.toFixed(2)} ₺. Refreshed automatically once a day — approximate, not for invoicing.`
              : "Rate fetched automatically once a day — approximate, not for invoicing."}
          </p>

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
        <h2 className="mb-1 text-base font-semibold text-slate-900">Confirmation letter branding</h2>
        <p className="mb-5 text-sm text-slate-500">
          Clinic name, contact details and logo shown on the patient confirmation letter.
        </p>

        <form action={handleBrandingSubmit} className="space-y-4">
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Clinic logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">No logo</span>
                )}
              </div>
              <input
                type="file"
                name="clinic_logo"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoChange}
                className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">PNG, JPEG, SVG or WebP, up to 2MB.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Clinic name (full)</Label>
              <Input name="clinic_name" defaultValue={settings.clinic_name} required />
            </div>
            <div>
              <Label>Clinic name (short)</Label>
              <Input name="clinic_short_name" defaultValue={settings.clinic_short_name} required />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input name="clinic_address" defaultValue={settings.clinic_address} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input name="clinic_phone" defaultValue={settings.clinic_phone} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" name="clinic_email" defaultValue={settings.clinic_email} />
            </div>
          </div>

          {brandingError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{brandingError}</p>
          )}
          {brandingSaved && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={brandingPending}>
              {brandingPending ? "Saving…" : "Save branding"}
            </Button>
          </div>
        </form>
      </Card>

      {settings.show_try && settings.currency !== "TRY" && (
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            {settings.currency}/TRY rate history
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Recorded once a day. Approximate — not for invoicing.
          </p>
          <RateHistoryChart data={rateHistory} base={settings.currency} />
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Dashboard cards</h2>
        <p className="mb-4 text-sm text-slate-500">
          Choose which stat cards show on the Dashboard, and drag ⠿ to reorder them.
        </p>
        <form action={handleCardsSubmit} className="space-y-3">
          <DashboardCardsPicker initialOrder={cardsInitialOrder} initialEnabled={cardsInitialEnabled} />
          {cardsError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{cardsError}</p>}
          {cardsSaved && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>
          )}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={cardsPending}>
              {cardsPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Privacy</h2>
        <p className="mb-4 text-sm text-slate-500">
          {hidden
            ? "Earnings/commission figures are hidden on Dashboard, Projections and Patients. Safe to show your screen."
            : "Earnings/commission figures are visible everywhere. Hide them before sharing your screen."}
        </p>
        <PrivacyToggleButton />
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
