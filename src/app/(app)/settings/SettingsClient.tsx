"use client";

import { ChangeEvent, useState, useTransition } from "react";
import { ClinicConfig, ClinicModule, CommissionSettings, Patient, Permission, Seller, TransferCompany } from "@/types";
import type { ClinicRole } from "@/lib/roles";
import { PermissionSummary } from "@/components/PermissionSummary";
import { usePermissions } from "@/components/permissions";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { downloadCsv, patientsToCsv } from "@/lib/csv";
import { PrivacyToggleButton, usePrivacy } from "@/components/privacy";
import { CelebrationSoundToggle } from "@/components/celebration-sound";
import { DashboardCardId, EARNINGS_CARD_IDS, OPERATIONAL_CARD_IDS } from "@/lib/dashboard-cards";
import { DashboardCardsPicker } from "@/components/DashboardCardsPicker";
import { ExchangeRatePoint, TeamMember } from "@/lib/data";
import { RateHistoryChart } from "@/components/RateHistoryChart";
import { AccountCard } from "./AccountCard";
import { TeamCard } from "./TeamCard";
import { RolesCard } from "./RolesCard";
import { SellerRecordRow, SellersCard } from "./SellersCard";
import { TelegramCard } from "./TelegramCard";
import { TelegramGroupCard } from "./TelegramGroupCard";
import { SystemSettingsCard } from "./SystemSettingsCard";
import { TransfersCard } from "./TransfersCard";
import { DriverMessagesCard, WhatsAppSecretsStatus } from "./DriverMessagesCard";
import { saveClinicBranding, saveDashboardCards, saveSettings } from "./actions";

const CURRENCIES = ["GBP", "USD", "EUR", "TRY"];

type TabId = "account" | "commission" | "cards" | "transfers" | "clinic" | "roles" | "system" | "data";

/** Each tab with what it takes to see it (null: everyone). */
const TABS: { id: TabId; label: string; needs: Permission[] | null }[] = [
  { id: "account", label: "Account", needs: null },
  { id: "commission", label: "Commission", needs: ["earnings.own"] },
  { id: "cards", label: "Cards", needs: ["earnings.own"] },
  { id: "transfers", label: "Transfers", needs: ["transfers.manage", "drivers.manage"] },
  { id: "clinic", label: "Team & clinic", needs: ["team.view", "team.manage", "sellers.manage", "settings.branding", "settings.telegram"] },
  { id: "roles", label: "Roles", needs: ["roles.view", "roles.edit", "roles.delete"] },
  { id: "system", label: "System", needs: ["settings.money"] },
  { id: "data", label: "Data", needs: ["patients.export"] },
];

export function SettingsClient({
  settings,
  patients,
  rateHistory,
  teamMembers,
  sellerRecords,
  allSellers,
  currentUserId,
  currentUserEmail,
  currentDisplayName,
  telegramConnected,
  clinicConfig,
  transferCompanies,
  initialTab,
  whatsappSecrets,
  webhookUrl,
  roles,
  memberCounts,
  myRoles,
  modules,
}: {
  settings: CommissionSettings;
  patients: Patient[];
  rateHistory: ExchangeRatePoint[];
  teamMembers: TeamMember[];
  /** Admins only: sellers without an account, with their patient count and rates. */
  sellerRecords: SellerRecordRow[];
  allSellers: Seller[];
  currentUserId: string;
  currentUserEmail: string;
  currentDisplayName: string;
  telegramConnected: boolean;
  clinicConfig: ClinicConfig;
  transferCompanies: TransferCompany[];
  /** From ?tab= — e.g. the "Turn on in Settings" link opens Transfers. */
  initialTab?: string;
  /** Admins only: which WhatsApp secrets are saved (never the secrets). */
  whatsappSecrets: WhatsAppSecretsStatus | null;
  webhookUrl: string;
  /** The clinic's roles with what each can do (Roles tab, Team card, "What I can do"). */
  roles: ClinicRole[];
  /** Members per role key, for the Roles tab. */
  memberCounts: Record<string, number>;
  /** The viewer's own roles. */
  myRoles: string[];
  modules: ClinicModule[];
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
  const [brandingPending, startBrandingTransition] = useTransition();
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(clinicConfig.clinicLogoUrl);
  const { hidden, tryRate } = usePrivacy();
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
          <AccountCard email={currentUserEmail} displayName={currentDisplayName} />

          <Card className="p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">What I can do</h2>
            <p className="mb-4 text-sm text-slate-500">
              {myRoles.length > 0
                ? `Your roles: ${myRoles.map((key) => roles.find((r) => r.key === key)?.name ?? "Custom role").join(", ")}.`
                : "You have no roles in this clinic."}{" "}
              Ask an admin if you need something that isn&apos;t here.
            </p>
            <PermissionSummary permissions={permissions} modules={modules} />
          </Card>

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

      {activeTab === "clinic" && tabs.some((t) => t.id === "clinic") && (
        <div className="space-y-6">
          {(has("team.view") || has("team.manage")) && (
            <TeamCard
              members={teamMembers}
              currentUserId={currentUserId}
              canManage={has("team.manage")}
              canDelete={has("team.delete")}
              roles={roles}
              modules={modules}
            />
          )}

          {has("sellers.manage") && <SellersCard rows={sellerRecords} allSellers={allSellers} currentUserId={currentUserId} />}

          {has("settings.telegram") && <TelegramGroupCard groupChatId={clinicConfig.telegramGroupChatId} />}

          {has("settings.branding") && (
          <Card className="p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Confirmation letter branding</h2>
            <p className="mb-5 text-sm text-slate-500">
              Clinic name, contact details and logo — shared across every seller&apos;s confirmation
              letters and quote offers, not just your own.
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
                  <Input name="clinic_name" defaultValue={clinicConfig.clinicName} required />
                </div>
                <div>
                  <Label>Clinic name (short)</Label>
                  <Input name="clinic_short_name" defaultValue={clinicConfig.clinicShortName} required />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input name="clinic_address" defaultValue={clinicConfig.clinicAddress} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input name="clinic_phone" defaultValue={clinicConfig.clinicPhone} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" name="clinic_email" defaultValue={clinicConfig.clinicEmail} />
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
          )}
        </div>
      )}

      {activeTab === "transfers" && (
        <div className="space-y-6">
          <DriverMessagesCard config={clinicConfig.driverMessages} isAdmin={has("messaging.manage")} secrets={whatsappSecrets} webhookUrl={webhookUrl} />
          <TransfersCard companies={transferCompanies} defaults={clinicConfig.transferDefaults} isAdmin={has("drivers.manage")} />
        </div>
      )}

      {activeTab === "roles" && tabs.some((t) => t.id === "roles") && (
        <RolesCard
          roles={roles}
          memberCounts={memberCounts}
          modules={modules}
          canEdit={has("roles.edit")}
          canDelete={has("roles.delete")}
        />
      )}

      {activeTab === "system" && has("settings.money") && (
        <div className="space-y-6">
          <SystemSettingsCard clinicConfig={clinicConfig} />
        </div>
      )}

      {activeTab === "data" && has("patients.export") && (
        <div className="space-y-6">
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
      )}
    </div>
  );
}
