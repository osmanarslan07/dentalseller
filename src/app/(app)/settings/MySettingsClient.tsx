"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CommissionSettings, Permission } from "@/types";
import { usePermissions } from "@/components/permissions";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { PrivacyToggleButton, usePrivacy } from "@/components/privacy";
import { CelebrationSoundToggle } from "@/components/celebration-sound";
import { DashboardCardId, EARNINGS_CARD_IDS, OPERATIONAL_CARD_IDS } from "@/lib/dashboard-cards";
import { DashboardCardsPicker } from "@/components/DashboardCardsPicker";
import { ExchangeRatePoint } from "@/lib/data";
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES, currencySymbol } from "@/lib/money";
import { useCurrencies } from "@/components/currency";
import { RateHistoryChart } from "@/components/RateHistoryChart";
import { TelegramCard } from "./TelegramCard";
import { saveDashboardCards, saveSettings } from "./actions";

type TabId = "account" | "commission" | "cards";

/** My settings: what is personal to whoever is signed in. Clinic-wide settings live under
 * Clinic settings (/settings/clinic). Each tab with what it takes to see it (null: everyone). */
const TABS: { id: TabId; label: string; needs: Permission[] | null }[] = [
  { id: "account", label: "General", needs: null },
  { id: "commission", label: "Commission & currency", needs: ["earnings.own"] },
  { id: "cards", label: "Cards", needs: ["earnings.own"] },
];

export function MySettingsClient({
  settings,
  rateHistory,
  telegramConnected,
  initialTab,
}: {
  settings: CommissionSettings;
  rateHistory: ExchangeRatePoint[];
  telegramConnected: boolean;
  /** From ?tab= — which of My settings' tabs opens first. */
  initialTab?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cardsPending, startCardsTransition] = useTransition();
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsSaved, setCardsSaved] = useState(false);
  const [earningsCardsPending, startEarningsCardsTransition] = useTransition();
  const [earningsCardsError, setEarningsCardsError] = useState<string | null>(null);
  const [earningsCardsSaved, setEarningsCardsSaved] = useState(false);
  const { hidden, approx } = usePrivacy();
  const { main } = useCurrencies();
  const sym = currencySymbol(main);
  const permissions = usePermissions();
  const has = (p: Permission) => permissions.includes(p);
  const tabs = TABS.filter((t) => !t.needs || t.needs.some(has));
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    tabs.some((t) => t.id === initialTab) ? (initialTab as TabId) : "account"
  );

  function cardsForCategory(categoryIds: DashboardCardId[]) {
    const eligible = new Set<DashboardCardId>(categoryIds);
    const savedOrder = settings.dashboard_cards.filter((id) => eligible.has(id));
    const initialOrder = [...savedOrder, ...categoryIds.filter((id) => !savedOrder.includes(id))];
    return { initialOrder, initialEnabled: new Set(savedOrder) };
  }

  const dashboardCardsState = cardsForCategory(OPERATIONAL_CARD_IDS);
  const earningsCardsState = cardsForCategory(EARNINGS_CARD_IDS);

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

  function handleEarningsCardsSubmit(formData: FormData) {
    setEarningsCardsError(null);
    setEarningsCardsSaved(false);
    startEarningsCardsTransition(async () => {
      try {
        await saveDashboardCards(formData);
        setEarningsCardsSaved(true);
        setTimeout(() => setEarningsCardsSaved(false), 2500);
      } catch (e) {
        setEarningsCardsError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My settings</h1>
        <p className="mt-1 text-sm text-slate-500">Your commission and what you see on your screen. Name, email, phone and password are on <Link href="/profile" className="font-medium text-teal-700 hover:underline">My profile</Link>.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "account" && (
        <div className="space-y-6">
          <TelegramCard connected={telegramConnected} />

          {(has("earnings.own") || has("earnings.all")) && (
            <Card className="p-6">
              <h2 className="mb-1 text-base font-semibold text-slate-900">Privacy</h2>
              <p className="mb-4 text-sm text-slate-500">
                {hidden
                  ? "Earnings/commission figures are hidden on Earnings and Patients. Safe to show your screen."
                  : "Earnings/commission figures are visible everywhere. Hide them before sharing your screen."}
              </p>
              <PrivacyToggleButton />
            </Card>
          )}

          <Card className="p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Celebrations</h2>
            <p className="mb-4 text-sm text-slate-500">
              A little confetti (and, if you keep this on, a short chime) when you close a sale,
              get paid, or hit a higher commission tier.
            </p>
            <CelebrationSoundToggle />
          </Card>
        </div>
      )}

      {activeTab === "commission" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Commission tiers</h2>
            <p className="mb-5 text-sm text-slate-500">
              Applied to the full monthly total, not marginal — whichever tier the month&apos;s total falls
              into, that rate applies to the whole total. Plus a fixed payment added every month.
            </p>

            <form action={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tier 1 threshold ({sym}, up to)</Label>
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
                  <Label>Tier 2 threshold ({sym}, up to)</Label>
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
                  <Label>Fixed monthly payment ({sym})</Label>
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

              <p className="text-xs text-slate-500">
                Amounts, tiers and commission are in the clinic&apos;s main currency ({main}).
              </p>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="show_try"
                    defaultChecked={settings.show_try}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                  />
                  Also show approx. in
                </label>
                <Select name="approx_currency" defaultValue={settings.approx_currency} className="w-auto" aria-label="Approximate currency">
                  {SUPPORTED_CURRENCIES.filter((c) => c !== main).map((c) => (
                    <option key={c} value={c}>
                      {c} — {CURRENCY_NAMES[c]}
                    </option>
                  ))}
                </Select>
                <span>alongside earnings figures</span>
              </div>
              <p className="text-xs text-slate-400">
                {approx
                  ? `Current rate: 1 ${main} ≈ ${approx.rate.toFixed(approx.rate >= 100 ? 2 : 4)} ${approx.currency}. Refreshed automatically once a day — approximate, not for invoicing.`
                  : "Rate fetched automatically once a day — approximate, not for invoicing."}
              </p>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              {saved && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </form>
          </Card>

          {settings.show_try && settings.approx_currency !== main && (
            <Card className="p-6">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                {main}/{settings.approx_currency} rate history
              </h2>
              <p className="mb-4 text-sm text-slate-500">
                Recorded once a day. Approximate — not for invoicing.
              </p>
              <RateHistoryChart data={rateHistory} base={main} quote={settings.approx_currency} />
            </Card>
          )}
        </div>
      )}

      {activeTab === "cards" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Dashboard cards</h2>
            <p className="mb-4 text-sm text-slate-500">
              Choose which operational stat cards show on the Dashboard, and drag ⠿ to reorder them.
            </p>
            <form action={handleCardsSubmit} className="space-y-3">
              <DashboardCardsPicker
                initialOrder={dashboardCardsState.initialOrder}
                initialEnabled={dashboardCardsState.initialEnabled}
                category="dashboard"
              />
              {cardsError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{cardsError}</p>
              )}
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
            <h2 className="mb-1 text-base font-semibold text-slate-900">Earnings cards</h2>
            <p className="mb-4 text-sm text-slate-500">
              Choose which commission stat cards show on Earnings, and drag ⠿ to reorder them.
            </p>
            <form action={handleEarningsCardsSubmit} className="space-y-3">
              <DashboardCardsPicker
                initialOrder={earningsCardsState.initialOrder}
                initialEnabled={earningsCardsState.initialEnabled}
                category="earnings"
              />
              {earningsCardsError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{earningsCardsError}</p>
              )}
              {earningsCardsSaved && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>
              )}
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={earningsCardsPending}>
                  {earningsCardsPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

    </div>
  );
}
