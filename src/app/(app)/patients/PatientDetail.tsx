"use client";

import { DateInput } from "@/components/DateInput";
import type { CoordinatorOption } from "@/lib/coordinators";
import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { ActivityLogRow } from "@/lib/activity-log";
import { isMismatch, patientDueNow, todayIsoLocal, visitBalances } from "@/lib/balance";
import { downloadCsv, patientsToCsv } from "@/lib/csv";
import { DEFAULT_CLINIC_CONFIG, DriverMessagesMode, Patient, PatientFile, Profile, Seller, Transfer, TransferCompany, TransferDefaults } from "@/types";
import { addExtraVisit, deletePatient, getPatientActivity, sendPatientTelegramMessage, updatePatientFields } from "./actions";
import { ChevronIcon, KebabIcon, Menu } from "./detail/Menu";
import { moneyIn, Pill } from "./detail/bits";
import { currencySymbol } from "@/lib/money";
import { currentVisitKey, forVisit, patientVisits, shortDate, transfersWithoutDriver, whatsappNumber } from "./detail/visits";
import { VisitTab, visitStage } from "./detail/VisitTab";
import { documentLinks, EDIT_SALE_EVENT, PatientInfoTab } from "./detail/PatientInfoTab";
import { HistoryTab } from "./detail/HistoryTab";
import { sellerLabel } from "@/lib/sellers";
import { useCan } from "@/components/permissions";
import { useLocale, useT } from "@/i18n/client";

const PAGE_TABS = ["info", "history"] as const;

/** The patient page: a header with who they are and what needs attention, then one tab per
 * visit (the same layout for each), Patient info and History. Every card saves on its own —
 * there's no page-wide Save. */
export function PatientDetail({
  patient,
  initialTab,
  hotelOptions = [],
  roomTypeOptions = [],
  profiles = [],
  sellers = [],
  currentUserId = "",
  canAssignSellers = false,
  coordinators = [],
  transfers = [],
  files = [],
  companies = [],
  surchargeRate = 0.03,
  deductCosts = false,
  transferDefaults = DEFAULT_CLINIC_CONFIG.transferDefaults,
  driverMessages = "app",
}: {
  patient: Patient;
  /** From ?tab= — a visit key, "info" or "history". */
  initialTab?: string;
  /** Previously-used hotel names / room types, offered as autocomplete suggestions. */
  hotelOptions?: string[];
  roomTypeOptions?: string[];
  profiles?: Profile[];
  /** The clinic's seller list — accounts and sellers without one. */
  sellers?: Seller[];
  currentUserId?: string;
  canAssignSellers?: boolean;
  /** Who can coordinate patients (see getCoordinatorOptions). */
  coordinators?: CoordinatorOption[];
  /** Every transfer of this patient, all visits. */
  transfers?: Transfer[];
  /** The patient's files (Patient info tab). */
  files?: PatientFile[];
  companies?: TransferCompany[];
  /** The clinic's card surcharge rate (System settings). */
  surchargeRate?: number;
  /** Settings → System: hotel/transfer costs come off before commission. */
  deductCosts?: boolean;
  /** Settings → Transfers: default company/driver for new transfers. */
  transferDefaults?: TransferDefaults;
  /** Settings → Transfers: how drivers get their messages. */
  driverMessages?: DriverMessagesMode;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const canEdit = useCan("patients.edit");
  const canDelete = useCan("patients.delete");
  const canExport = useCan("patients.export");
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [addingExtra, setAddingExtra] = useState(false);
  const today = todayIsoLocal();

  const visits = patientVisits(patient);
  const isValidTab = (k: string | undefined): k is string =>
    !!k && (visits.some((v) => v.key === k) || (PAGE_TABS as readonly string[]).includes(k));
  const [tab, setTabState] = useState(() => (isValidTab(initialTab) ? initialTab : currentVisitKey(visits)));
  // a removed visit (or visit 2 switched off elsewhere) falls back to the current visit
  const activeTab = isValidTab(tab) ? tab : currentVisitKey(visits);

  function setTab(k: string) {
    setTabState(k);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    window.history.replaceState(null, "", url);
  }

  // History loads the first time its tab is opened, then stays for the page's lifetime.
  const [history, setHistory] = useState<ActivityLogRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  useEffect(() => {
    if (activeTab !== "history" || history !== null || historyError) return;
    let cancelled = false;
    getPatientActivity(patient.id)
      .then((rows) => !cancelled && setHistory(rows))
      .catch((e) => !cancelled && setHistoryError(e instanceof Error ? e.message : t("Failed to load history")));
    return () => {
      cancelled = true;
    };
  }, [activeTab, history, historyError, patient.id]);

  function run(action: () => Promise<unknown>, done: string) {
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

  function handleDelete() {
    if (!confirm(t("Delete {name}? Their visits, payments, extras and transfers go too. This cannot be undone.", { name: patient.name }))) return;
    startTransition(async () => {
      try {
        await deletePatient(patient.id);
        showToast(t("Patient deleted"));
        router.push("/patients");
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Failed to delete patient"), "error");
      }
    });
  }

  function addVisit2() {
    startTransition(async () => {
      try {
        await updatePatientFields(patient.id, { needs_visit2: true });
        showToast(t("Visit 2 added ✓"));
        setTab("visit2");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Something went wrong"), "error");
      }
    });
  }

  // What needs attention, for the header
  const current = visits.find((v) => v.key === currentVisitKey(visits))!;
  const stage = visitStage(current, today);
  const allDone = visits.every((v) => v.status === "completed");
  const dueBadges = patientDueNow(patient, today).short;
  const noDriver = transfersWithoutDriver(transfers);
  const balances = new Map(visitBalances(patient).map((b) => [b.key, b]));
  const needsAttention = (key: string) => {
    const b = balances.get(key);
    return (!!b && isMismatch(b, today)) || transfersWithoutDriver(forVisit(transfers, key)).length > 0;
  };

  const sellerName = sellerLabel(sellers.find((s) => s.id === patient.responsible_seller_id));
  const fmt = moneyIn(patient.currency);
  const wa = patient.phone ? whatsappNumber(patient.phone) : "";
  const komoIsLink = !!patient.komo_reference && /^https?:\/\//i.test(patient.komo_reference);
  const docs = documentLinks(patient, visits, t);

  const tabClass = (key: string) =>
    `flex shrink-0 flex-col gap-0.5 border-b-2 px-3.5 pb-2.5 pt-1 text-left text-sm font-semibold transition ${
      key === activeTab ? "border-teal-700 text-teal-700" : "border-transparent text-slate-700 hover:text-slate-900"
    }`;
  const activeVisit = visits.find((v) => v.key === activeTab);

  return (
    <div className="-mt-2 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-slate-200">
        <Link href="/patients" className="self-start text-[13px] font-medium text-teal-700 hover:text-teal-800">
          ← {t("Patients")}
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="mr-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[26px]">{patient.name}</h1>
              <Pill tone={allDone ? "green" : stage.tone === "slate" ? "slate" : "teal"}>
                {allDone ? t("All visits completed") : `${t(current.label)} · ${t(stage.label)}`}
              </Pill>
              {dueBadges.map((b) => (
                <Pill key={b.key} tone={b.due > 0 ? "amber" : "blue"}>
                  {t(b.label)}: {b.due > 0 ? t("{amount} due", { amount: fmt(b.due) }) : t("Overpaid {amount}", { amount: fmt(-b.due) })}
                </Pill>
              ))}
              {noDriver.length > 0 && (
                <Pill tone="amber">
                  {noDriver.length === 1 ? t("1 transfer without driver") : t("{n} transfers without driver", { n: noDriver.length })}
                </Pill>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[13px] text-slate-600">
              {patient.treatment && (
                <>
                  <span>{patient.treatment}</span>
                  <span className="hidden text-slate-300 sm:inline">|</span>
                </>
              )}
              {patient.phone ? (
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-900">{patient.phone}</span>
                  {wa.length >= 8 && (
                    <>
                      <a
                        href={`tel:${patient.phone.replace(/[^\d+]/g, "")}`}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {t("Call")}
                      </a>
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        WhatsApp
                      </a>
                    </>
                  )}
                </span>
              ) : (
                <button type="button" onClick={() => setTab("info")} className="font-medium text-teal-700 hover:text-teal-800">
                  + {t("Add phone")}
                </button>
              )}
              <span className="hidden text-slate-300 sm:inline">|</span>
              <span>
                {t("Seller")} <span className="font-semibold text-slate-900">{sellerName}</span>
              </span>
              {patient.komo_reference && (
                <>
                  <span className="hidden text-slate-300 sm:inline">|</span>
                  {komoIsLink ? (
                    <a href={patient.komo_reference} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:text-teal-800">
                      {t("Komo lead")} ↗
                    </a>
                  ) : (
                    <span>Komo {patient.komo_reference}</span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Menu
              trigger={
                <>
                  {pending ? t("Working…") : "Telegram"} <ChevronIcon />
                </>
              }
              heading={t("Send to the seller’s Telegram")}
              disabled={pending}
              items={visits.map((v) => ({
                label: t(v.label),
                hint: v.date ? shortDate(v.date, false, locale) : t("not booked yet"),
                onSelect: () => run(() => sendPatientTelegramMessage(patient.id, v.key), t("Sent to Telegram ✓")),
              }))}
            />
            <Menu
              trigger={
                <>
                  {t("Documents")} <ChevronIcon />
                </>
              }
              heading={t("Open in a new tab")}
              items={docs.map((d) => ({ label: d.label, hint: d.hint, href: d.href }))}
            />
            <Menu
              trigger={<KebabIcon />}
              ariaLabel={t("More actions")}
              heading={t("Patient")}
              buttonClassName="rounded-xl bg-slate-100 px-2.5 py-2 text-slate-700 hover:bg-slate-200"
              items={[
                ...(canEdit ? [{ label: t("Duplicate for a group booking"), hint: t("same flights & hotel"), onSelect: () => router.push(`/patients/new?from=${patient.id}`) }] : []),
                ...(canEdit && (canAssignSellers || patient.responsible_seller_id === currentUserId) ? [{
                  label: t("Reassign seller…"),
                  hint: t("{name} now", { name: sellerName }),
                  onSelect: () => {
                    setTab("info");
                    // after the tab switch has rendered the Sale card: open it for editing, then show it
                    setTimeout(() => {
                      window.dispatchEvent(new Event(EDIT_SALE_EVENT));
                      document.getElementById("reassign")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 50);
                  },
                }] : []),
                ...(canExport ? [{
                  label: t("Export to CSV"),
                  onSelect: () => downloadCsv(`${patient.name.replace(/[^\w\- ]+/g, "").trim() || "patient"}.csv`, patientsToCsv([patient])),
                }] : []),
                ...(canDelete || (canEdit && patient.responsible_seller_id === currentUserId)
                  ? [{ label: t("Delete patient…"), hint: t("asks to confirm"), danger: true, divider: true, disabled: pending, onSelect: handleDelete }]
                  : []),
              ]}
            />
          </div>
        </div>

        {/* Tabs */}
        <nav className="-mb-px mt-1 flex items-end gap-1 overflow-x-auto" aria-label={t("Patient sections")}>
          {visits.map((v) => (
            <button key={v.key} type="button" onClick={() => setTab(v.key)} className={tabClass(v.key)} aria-current={v.key === activeTab ? "page" : undefined}>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {t(v.label)}
                {needsAttention(v.key) && <span className="h-[7px] w-[7px] rounded-full bg-amber-600" aria-label={t("needs attention")} />}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">
                {v.status === "completed" ? t("Completed") : v.date ? shortDate(v.date, false, locale) : t("Not booked")}
              </span>
            </button>
          ))}
          {canEdit && (
          <Menu
            trigger={<>+ {t("Visit")}</>}
            heading={t("Add a visit")}
            align="left"
            disabled={pending}
            buttonClassName="shrink-0 whitespace-nowrap px-3 pb-3 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
            items={[
              ...(!patient.needs_visit2 ? [{ label: t("Visit 2"), hint: t("second stage, recall reminder"), onSelect: addVisit2 }] : []),
              { label: t("Extra visit"), hint: t("e.g. temporary crown fix"), onSelect: () => setAddingExtra(true) },
            ]}
          />
          )}
          <div className="min-w-4 grow" />
          <button type="button" onClick={() => setTab("info")} className={tabClass("info")} aria-current={activeTab === "info" ? "page" : undefined}>
            <span className="whitespace-nowrap">{t("Patient info")}</span>
            <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">{t("Details & totals")}</span>
          </button>
          <button type="button" onClick={() => setTab("history")} className={tabClass("history")} aria-current={activeTab === "history" ? "page" : undefined}>
            <span>{t("History")}</span>
            <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">
              {history
                ? history.length === 1
                  ? t("1 change")
                  : t("{n} changes", { n: `${history.length}${history.length === 100 ? "+" : ""}` })
                : t("Every change")}
            </span>
          </button>
        </nav>
      </header>

      {activeVisit && (
        <VisitTab
          key={activeVisit.key}
          patient={patient}
          visit={activeVisit}
          visit1={visits[0]}
          transfers={transfers}
          companies={companies}
          profiles={profiles}
          sellers={sellers}
          currentUserId={currentUserId}
          surchargeRate={surchargeRate}
          deductCosts={deductCosts}
          transferDefaults={transferDefaults}
          driverMessages={driverMessages}
          hotelOptions={hotelOptions}
          roomTypeOptions={roomTypeOptions}
          onRemoved={() => setTab(visits[0].key)}
        />
      )}
      {activeTab === "info" && (
        <PatientInfoTab patient={patient} visits={visits} profiles={profiles} sellers={sellers} currentUserId={currentUserId} canAssignSellers={canAssignSellers} coordinators={coordinators} files={files} onOpenVisit={setTab} />
      )}
      {activeTab === "history" && <HistoryTab patient={patient} profiles={profiles} sellers={sellers} entries={history} error={historyError} />}

      <AddExtraVisitModal
        open={addingExtra}
        onClose={() => setAddingExtra(false)}
        patientId={patient.id}
        currency={patient.currency}
        onAdded={(id) => {
          setAddingExtra(false);
          setTab(id);
        }}
      />
    </div>
  );
}

function AddExtraVisitModal({
  open,
  onClose,
  patientId,
  currency,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  /** The patient's deal currency. */
  currency: string;
  onAdded: (id: string) => void;
}) {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const { id } = await addExtraVisit(patientId, fd);
        showToast(t("Extra visit added ✓"));
        onAdded(id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Add an extra visit")}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">
          {t("Any visit besides visits 1 and 2 — e.g. fixing a temporary crown. Flights, hotel, money and transfers go on its tab.")}
        </p>
        <div>
          <Label>{t("Name")}</Label>
          <Input name="label" required placeholder={t("Temp crown fix")} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("Date")}</Label>
            <DateInput name="visit_date" />
          </div>
          <div>
            <Label>{t("Price ({sym})", { sym: currencySymbol(currency) })}</Label>
            <Input type="number" min="0" step="0.01" name="expected" placeholder={t("Optional")} />
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("Adding…") : t("Add visit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
