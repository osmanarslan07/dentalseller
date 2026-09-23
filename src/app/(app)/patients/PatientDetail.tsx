"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCelebrationSound } from "@/components/celebration-sound";
import { fireConfetti, playChime } from "@/lib/celebrate";
import { formatDate } from "@/lib/format";
import { describeActivity, formatActivityTime, ActivityLogRow } from "@/lib/activity-log";
import { DEFAULT_CLINIC_CONFIG, Patient, PatientExtraVisit, Profile, Transfer, TransferCompany, TransferDefaults } from "@/types";
import { TransfersSection, VisitTravel } from "./TransfersSection";
import { ExtrasSection } from "./ExtrasSection";
import { PaymentsSection } from "./PaymentsSection";
import { extrasTotalFor, visitCosts } from "@/lib/commission";
import { patientDueNow, todayIsoLocal } from "@/lib/balance";

/** What a payments section needs besides the visit itself. */
type PaymentContext = {
  profiles: Profile[];
  currentUserId: string;
  surchargeRate: number;
  deductCosts: boolean;
  transferDefaults: TransferDefaults;
};

/** Before the current month — changing such a visit's costs changes a month already paid out. */
function isPastMonth(date: string | null | undefined): boolean {
  if (!date) return false;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return date.slice(0, 7) < current;
}

/** The hotel cost input — shared by visit 1/2 and extra visits. */
function HotelCostInput({
  name,
  defaultValue,
  deductCosts,
  visitDate,
}: {
  name: string;
  defaultValue: number | null | undefined;
  deductCosts: boolean;
  visitDate: string | null | undefined;
}) {
  return (
    <div>
      <Label>Hotel cost (£)</Label>
      <Input type="number" step="0.01" min="0" name={name} defaultValue={defaultValue ?? ""} placeholder="Patient pays" />
      <p className="mt-1 text-xs text-slate-400">
        What the clinic pays the hotel. Leave empty if the patient pays their own.
        {deductCosts && " Deducted before commission."}
      </p>
      {deductCosts && isPastMonth(visitDate) && (
        <p className="mt-1 text-xs text-amber-700">⚠ This visit is in a past month — changing it changes that month&apos;s commission.</p>
      )}
    </div>
  );
}
import {
  createPatient,
  updatePatient,
  reassignPatient,
  deletePatient,
  sendPatientTelegramMessage,
  addExtraVisit,
  updateExtraVisit,
  deleteExtraVisit,
  getPatientActivity,
} from "./actions";

type TabId = "visit1" | "visit2" | "extra" | "history";

const FORM_ID = "patient-form";

/** ExtraVisitFields' add/edit forms aren't real <form> elements (they're built inline so
 * they can share one field set for both add and save), so FormData has to be collected by
 * hand. Checkboxes need special handling here — `.value` is always "on" regardless of
 * `.checked`, so a blind `.value` read would treat every unchecked box as checked. */
function collectFormData(container: HTMLElement): FormData {
  const formData = new FormData();
  for (const el of container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "[name]"
  )) {
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      if (el.checked) formData.set(el.name, "on");
    } else {
      formData.set(el.name, el.value);
    }
  }
  return formData;
}

function mainVisitTravel(p: Patient, n: 1 | 2): VisitTravel {
  return {
    date: p[`visit${n}_date`],
    arrivalDate: p[`visit${n}_arrival_date`],
    arrivalTime: p[`visit${n}_arrival_time`],
    arrivalFlight: p[`visit${n}_arrival_flight_no`],
    departureDate: p[`visit${n}_departure_date`],
    departureTime: p[`visit${n}_departure_time`],
    departureFlight: p[`visit${n}_departure_flight_no`],
    hotel: p[`visit${n}_hotel_name`],
    pax: p[`visit${n}_pax`],
  };
}

function extraVisitTravel(v: PatientExtraVisit): VisitTravel {
  return {
    date: v.visit_date,
    arrivalDate: v.arrival_date,
    arrivalTime: v.arrival_time,
    arrivalFlight: v.arrival_flight_no,
    departureDate: v.departure_date,
    departureTime: v.departure_time,
    departureFlight: v.departure_flight_no,
    hotel: v.hotel_name,
    pax: v.pax,
  };
}

/** Digits only, for wa.me links — "+44 7700 900123" → "447700900123". */
function whatsappNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function patientStageLabel(p: Patient): string {
  if (!p.visit1_date) return "Confirmed";
  if (p.visit1_status !== "completed") return "Visit 1 scheduled";
  if (!p.needs_visit2 || p.visit2_status === "completed") return "Done";
  if (p.visit2_date) return "Visit 2 scheduled";
  return "Visit 1 completed";
}

function documentLinks(p: Patient): { label: string; href: string }[] {
  return [
    p.confirmation_date && p.visit1_date
      ? { label: "Operations sheet · Visit 1", href: `/patients/${p.id}/document?visit=1` }
      : null,
    p.confirmation_date && p.visit2_date
      ? { label: "Operations sheet · Visit 2", href: `/patients/${p.id}/document?visit=2` }
      : null,
    ...p.extra_visits
      .filter((v) => v.visit_date)
      .map((v) => ({ label: `Operations sheet · ${v.label}`, href: `/patients/${p.id}/document?visit=${v.id}` })),
    p.visit1_arrival_flight_no
      ? { label: "Confirmation letter · Visit 1", href: `/patients/${p.id}/confirmation-letter?visit=1` }
      : null,
    p.visit2_arrival_flight_no
      ? { label: "Confirmation letter · Visit 2", href: `/patients/${p.id}/confirmation-letter?visit=2` }
      : null,
  ].filter((item): item is { label: string; href: string } => item != null);
}

const MENU_ITEM =
  "block w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-teal-600 disabled:opacity-50";

/** A small header dropdown that closes on any click — outside it, or on one of its items. */
function HeaderMenu({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 ${open ? "bg-slate-200" : "bg-slate-100"}`}
      >
        {label}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** The full patient page — replaces the old edit popup. One form holds the patient's own
 * fields plus visit 1/2 (a single updatePatient save, as before); extra visits and history
 * sit outside it since they save/load on their own. Used for both an existing patient and
 * /patients/new (optionally prefilled from another patient for group bookings). */
export function PatientDetail({
  patient,
  duplicateFrom,
  hotelOptions = [],
  roomTypeOptions = [],
  profiles = [],
  currentUserId = "",
  isAdmin = false,
  existingPatients = [],
  transfers = [],
  companies = [],
  surchargeRate = 0.03,
  deductCosts = false,
  transferDefaults = DEFAULT_CLINIC_CONFIG.transferDefaults,
}: {
  patient?: Patient | null;
  /** Prefill a new (non-edit) patient from an existing one — for group bookings sharing a flight/hotel. */
  duplicateFrom?: Patient | null;
  /** Previously-used hotel names / room types, offered as autocomplete suggestions. */
  hotelOptions?: string[];
  roomTypeOptions?: string[];
  profiles?: Profile[];
  currentUserId?: string;
  isAdmin?: boolean;
  /** The shared roster, used to warn on create if the name matches someone already entered
   * (easy to do by accident now that multiple sellers add into the same pool). */
  existingPatients?: Pick<Patient, "id" | "name" | "confirmation_date" | "responsible_seller_id">[];
  /** Every transfer of this patient, all visits. */
  transfers?: Transfer[];
  companies?: TransferCompany[];
  /** The clinic's card surcharge rate (System settings). */
  surchargeRate?: number;
  /** Settings → System: hotel/transfer costs come off before commission. */
  deductCosts?: boolean;
  /** Settings → Transfers: default company/driver for new transfers. */
  transferDefaults?: TransferDefaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [telegramPending, setTelegramPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!patient;

  // Prefill source: the record being edited, or the record being duplicated from. Duplicating clears
  // fields that shouldn't carry over to a different person (name, phone, CRM ref, confirmation, payments made).
  const initial: Patient | (Partial<Patient> & { needs_visit2: boolean }) | null | undefined = patient
    ? patient
    : duplicateFrom
    ? {
        ...duplicateFrom,
        name: "",
        phone: null,
        komo_reference: null,
        confirmation_date: null,
        visit1_actual: null,
        visit2_actual: null,
        visit1_status: "upcoming",
        visit2_status: "upcoming",
      }
    : null;

  const [needsVisit2, setNeedsVisit2] = useState(initial ? initial.needs_visit2 : true);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("visit1");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();

  const [responsibleId, setResponsibleId] = useState(patient?.responsible_seller_id ?? "");
  const [reassignPending, setReassignPending] = useState(false);
  const canReassign = isEdit && (patient?.responsible_seller_id === currentUserId || isAdmin);

  const visitOptions = patient
    ? [
        { value: "visit1", label: "Visit 1" },
        ...(patient.needs_visit2 ? [{ value: "visit2", label: "Visit 2" }] : []),
        ...patient.extra_visits.map((v) => ({ value: v.id, label: v.label })),
      ]
    : [];
  const docs = patient ? documentLinks(patient) : [];

  // Leaving with unsaved edits (closing the tab, reloading) asks first — the old popup's
  // "Discard unsaved changes?" prompt, for a page.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function confirmLeave(): boolean {
    return !isDirty || confirm("Discard unsaved changes?");
  }

  function handleReassign(newSellerId: string) {
    if (!patient || newSellerId === responsibleId) return;
    if (!confirm("Reassign this patient to another seller? They will earn the commission from now on.")) {
      return;
    }
    setReassignPending(true);
    (async () => {
      try {
        await reassignPatient(patient.id, newSellerId);
        setResponsibleId(newSellerId);
        showToast("Patient reassigned ✓");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to reassign patient", "error");
      } finally {
        setReassignPending(false);
      }
    })();
  }

  async function handleSendTelegram(visitKey: string) {
    if (!patient) return;
    setTelegramPending(true);
    try {
      await sendPatientTelegramMessage(patient.id, visitKey);
      showToast("Sent to Telegram ✓");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to send to Telegram");
    } finally {
      setTelegramPending(false);
    }
  }

  async function handleDelete() {
    if (!patient) return;
    if (!confirm("Delete this patient? This cannot be undone.")) return;
    setDeletePending(true);
    try {
      await deletePatient(patient.id);
      setIsDirty(false);
      dirtyRef.current = false;
      showToast("Patient deleted");
      router.push("/patients");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete patient", "error");
      setDeletePending(false);
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    if (!isEdit) {
      const name = String(formData.get("name") ?? "").trim();
      const nameKey = name.toLowerCase();
      const dupes = existingPatients.filter((p) => p.name.trim().toLowerCase() === nameKey);
      if (dupes.length > 0) {
        const sellerNameFor = (id: string) => profiles.find((p) => p.id === id)?.display_name || "Unknown seller";
        const details = dupes
          .map((p) => `• Confirmed ${formatDate(p.confirmation_date)} — responsible: ${sellerNameFor(p.responsible_seller_id)}`)
          .join("\n");
        const proceed = confirm(
          `A patient named "${name}" already exists:\n\n${details}\n\nAdd another with the same name anyway?`
        );
        if (!proceed) return;
      }
    }

    startTransition(async () => {
      try {
        if (isEdit && patient) {
          await updatePatient(patient.id, formData);
          showToast("Patient saved ✓");
          setIsDirty(false);
          router.refresh();
        } else {
          const { id, celebration } = await createPatient(formData);
          fireConfetti();
          if (soundEnabled) playChime();
          showToast(celebration.message);
          setIsDirty(false);
          dirtyRef.current = false;
          router.replace(id ? `/patients/${id}` : "/patients");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "visit1", label: "Visit 1" },
    ...(needsVisit2 ? [{ id: "visit2" as TabId, label: "Visit 2" }] : []),
    ...(isEdit && patient
      ? [
          {
            id: "extra" as TabId,
            label: patient.extra_visits.length ? `Extra visits (${patient.extra_visits.length})` : "Extra visits",
          },
          { id: "history" as TabId, label: "History" },
        ]
      : []),
  ];

  const title = isEdit ? patient!.name : duplicateFrom ? `New patient (from ${duplicateFrom.name})` : "New patient";
  const waNumber = whatsappNumber(phone);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/patients"
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            ← Patients
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-slate-900">{title}</h1>
            {patient && <Badge tone="slate">{patientStageLabel(patient)}</Badge>}
            {patient &&
              patientDueNow(patient, todayIsoLocal()).short.map((b) => (
                <Badge key={b.key} tone={b.due > 0 ? "amber" : "blue"}>
                  {b.label}: {b.due > 0 ? `£${b.due.toLocaleString("en-GB")} due` : `overpaid £${(-b.due).toLocaleString("en-GB")}`}
                </Badge>
              ))}
          </div>
          {patient?.treatment && <p className="mt-0.5 text-sm text-slate-500">{patient.treatment}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {patient && docs.length > 0 && (
            <HeaderMenu label="Documents ▾">
              {docs.map((d) => (
                <Link key={d.href} href={d.href} target="_blank" className={MENU_ITEM}>
                  {d.label}
                </Link>
              ))}
            </HeaderMenu>
          )}
          {patient && (
            <HeaderMenu label={telegramPending ? "Sending…" : "Telegram ▾"}>
              {visitOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={telegramPending}
                  onClick={() => handleSendTelegram(o.value)}
                  className={MENU_ITEM}
                >
                  Send {o.label}
                </button>
              ))}
            </HeaderMenu>
          )}
          {patient && (
            <HeaderMenu label="⋯" title="More actions">
              <Link href={`/patients/new?from=${patient.id}`} className={MENU_ITEM}>
                Duplicate (group booking)
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className={`${MENU_ITEM} text-red-600 hover:text-red-700`}
              >
                {deletePending ? "Deleting…" : "Delete patient"}
              </button>
            </HeaderMenu>
          )}
          <Button type="submit" form={FORM_ID} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
          </Button>
        </div>
      </div>

      {duplicateFrom && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
          Prefilled from {duplicateFrom.name}&apos;s travel, hotel and treatment. Name, phone, Komo reference,
          confirmation date and payments were left blank for you to fill in.
        </p>
      )}

      <form
        id={FORM_ID}
        action={handleSubmit}
        onChange={(e) => {
          // the seller picker lives inside this form visually but saves on its own
          if ((e.target as unknown as HTMLInputElement).form?.id === FORM_ID) setIsDirty(true);
        }}
        className="space-y-6"
      >
        {/* Patient */}
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Patient</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <Input name="name" required defaultValue={initial?.name} placeholder="Jane Smith" />
            </div>
            <div className="sm:col-span-2">
              <Label>Phone</Label>
              <div className="flex gap-2">
                <Input
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7700 900123"
                  autoComplete="off"
                />
                {waNumber.length >= 8 && (
                  <>
                    <a
                      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                      title="Call"
                      className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${waNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open a WhatsApp chat"
                      className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      WhatsApp
                    </a>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">With country code, e.g. +44.</p>
            </div>

            <div className="sm:col-span-2">
              <Label>Treatment</Label>
              <Input name="treatment" defaultValue={initial?.treatment ?? ""} placeholder="Full mouth veneers" />
              <p className="mt-1 text-xs text-slate-400">
                Short label — shown on the dashboard, calendar and upcoming visits.
              </p>
            </div>
            <div>
              <Label>Confirmation date</Label>
              <Input type="date" name="confirmation_date" defaultValue={initial?.confirmation_date ?? ""} />
            </div>
            <div>
              <Label>Responsible seller</Label>
              {!isEdit ? (
                <p className="py-2 text-sm text-slate-700">You</p>
              ) : canReassign ? (
                <Select
                  value={responsibleId}
                  disabled={reassignPending}
                  // not part of the patient form — reassigning saves on its own, right away
                  form="__none"
                  onChange={(e) => handleReassign(e.target.value)}
                >
                  {profiles
                    .filter((p) => p.is_active || p.id === responsibleId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || "Unnamed seller"}
                        {p.id === currentUserId ? " (you)" : ""}
                      </option>
                    ))}
                </Select>
              ) : (
                <p className="py-2 text-sm font-medium text-slate-700">
                  {profiles.find((p) => p.id === responsibleId)?.display_name || "Unknown"}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label>Confirmation letter treatments</Label>
              <Textarea
                name="letter_treatment_items"
                rows={2}
                defaultValue={initial?.letter_treatment_items ?? ""}
                placeholder="12x Nucleoss T6 Dental Implants, 24x Dental Direkt Zirconium Crowns"
              />
              <p className="mt-1 text-xs text-slate-400">
                Comma-separated — each item becomes a bullet on the confirmation letter. Leave blank to fall back
                to the Treatment field.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Optional notes…" />
            </div>

            <div className="sm:col-span-2">
              <Label>Komo reference</Label>
              <Input name="komo_reference" defaultValue={initial?.komo_reference ?? ""} placeholder="Komo lead link or ID" />
              {initial?.komo_reference && /^https?:\/\//i.test(initial.komo_reference) && (
                <a
                  href={initial.komo_reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-teal-600 hover:underline"
                >
                  Open in Komo ↗
                </a>
              )}
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="needs_visit2"
                  checked={needsVisit2}
                  onChange={(e) => {
                    setNeedsVisit2(e.target.checked);
                    if (!e.target.checked && activeTab === "visit2") setActiveTab("visit1");
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                />
                Needs a second visit
              </label>
            </div>
            {needsVisit2 && (
              <div>
                <Label>Visit 2 recall (months)</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  name="visit2_recall_months"
                  defaultValue={initial?.visit2_recall_months ?? 3}
                  title="Once visit 1 is marked completed, a “Book visit 2” task is created, due this many months later."
                />
              </div>
            )}
          </div>
        </Card>

        {/* Visit tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === t.id
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div hidden={activeTab !== "visit1"} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitFields
            index={1}
            date={initial?.visit1_date}
            expected={initial?.visit1_expected}
            actual={initial?.visit1_actual}
            status={initial?.visit1_status}
            pax={initial?.visit1_pax}
          />
          <TravelFields
            index={1}
            arrivalDate={initial?.visit1_arrival_date}
            arrivalTime={initial?.visit1_arrival_time}
            arrivalFlightNo={initial?.visit1_arrival_flight_no}
            departureDate={initial?.visit1_departure_date}
            departureTime={initial?.visit1_departure_time}
            departureFlightNo={initial?.visit1_departure_flight_no}
            hotelName={initial?.visit1_hotel_name}
            roomType={initial?.visit1_room_type}
            hotelArranged={initial?.visit1_hotel_arranged}
            hotelCost={initial?.visit1_hotel_cost}
            visitDate={initial?.visit1_date}
            deductCosts={deductCosts}
            hotelOptions={hotelOptions}
            roomTypeOptions={roomTypeOptions}
          />
        </div>

        {needsVisit2 && (
          <div hidden={activeTab !== "visit2"} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <VisitFields
              index={2}
              date={initial?.visit2_date}
              expected={initial?.visit2_expected}
              actual={initial?.visit2_actual}
              status={initial?.visit2_status}
              pax={initial?.visit2_pax}
            />
            <TravelFields
              index={2}
              arrivalDate={initial?.visit2_arrival_date}
              arrivalTime={initial?.visit2_arrival_time}
              arrivalFlightNo={initial?.visit2_arrival_flight_no}
              departureDate={initial?.visit2_departure_date}
              departureTime={initial?.visit2_departure_time}
              departureFlightNo={initial?.visit2_departure_flight_no}
              hotelName={initial?.visit2_hotel_name}
              roomType={initial?.visit2_room_type}
              hotelArranged={initial?.visit2_hotel_arranged}
              hotelCost={initial?.visit2_hotel_cost}
              visitDate={initial?.visit2_date}
              deductCosts={deductCosts}
              hotelOptions={hotelOptions}
              roomTypeOptions={roomTypeOptions}
            />
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </form>

      {(activeTab === "visit1" || (activeTab === "visit2" && needsVisit2)) &&
        (isEdit && patient ? (
          <>
            <PaymentsSection
              key={`payments-${activeTab}`}
              patientId={patient.id}
              visitKey={activeTab}
              payments={patient.payments.filter((p) => p.visit_number === (activeTab === "visit1" ? 1 : 2))}
              expected={activeTab === "visit1" ? patient.visit1_expected : patient.visit2_expected}
              extrasTotal={extrasTotalFor(patient, activeTab)}
              profiles={profiles}
              currentUserId={currentUserId}
              surchargeRate={surchargeRate}
              costs={deductCosts ? visitCosts(patient, activeTab) : null}
            />
            <ExtrasSection
              key={`extras-${activeTab}`}
              patientId={patient.id}
              visitKey={activeTab}
              extras={patient.extras.filter((e) => e.visit_number === (activeTab === "visit1" ? 1 : 2))}
              hotel={activeTab === "visit1" ? patient.visit1_hotel_name : patient.visit2_hotel_name}
            />
            <TransfersSection
              key={activeTab}
              patientId={patient.id}
              patientName={patient.name}
              patientPhone={patient.phone}
              visitKey={activeTab}
              travel={mainVisitTravel(patient, activeTab === "visit1" ? 1 : 2)}
              transfers={transfers.filter((t) => t.visit_number === (activeTab === "visit1" ? 1 : 2))}
              companies={companies}
              deductCosts={deductCosts}
              defaults={transferDefaults}
            />
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-sm text-slate-400">
            Add the patient first — extras and transfers can be added right after.
          </p>
        ))}

      {isEdit && patient && (
        <div hidden={activeTab !== "extra"}>
          <ExtraVisitsSection
            patient={patient}
            transfers={transfers}
            companies={companies}
            pay={{ profiles, currentUserId, surchargeRate, deductCosts, transferDefaults }}
          />
        </div>
      )}

      {isEdit && patient && (
        <div hidden={activeTab !== "history"}>
          <HistorySection patient={patient} profiles={profiles} active={activeTab === "history"} />
        </div>
      )}

      {/* Sticky save bar — only while there's something to save */}
      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
            <span className="mr-auto text-sm text-amber-700">Unsaved changes</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!confirm("Discard unsaved changes?")) return;
                setIsDirty(false);
                dirtyRef.current = false;
                window.location.reload();
              }}
            >
              Discard
            </Button>
            <Button type="submit" form={FORM_ID} disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TravelFields({
  index,
  arrivalDate,
  arrivalTime,
  arrivalFlightNo,
  departureDate,
  departureTime,
  departureFlightNo,
  hotelName,
  roomType,
  hotelCost,
  visitDate,
  deductCosts = false,
  hotelArranged,
  hotelOptions = [],
  roomTypeOptions = [],
}: {
  index: 1 | 2;
  hotelCost?: number | null;
  visitDate?: string | null;
  deductCosts?: boolean;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  arrivalFlightNo?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  departureFlightNo?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
  hotelArranged?: boolean;
  hotelOptions?: string[];
  roomTypeOptions?: string[];
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Visit {index} · Flights &amp; hotel</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Label>Arrival date</Label>
          <Input type="date" name={`visit${index}_arrival_date`} defaultValue={arrivalDate ?? ""} />
        </div>
        <TimeInput name={`visit${index}_arrival_time`} label="Arrival time" defaultValue={arrivalTime} />
        <div>
          <Label>Arrival flight no.</Label>
          <Input name={`visit${index}_arrival_flight_no`} defaultValue={arrivalFlightNo ?? ""} placeholder="TK1234" />
        </div>
        <div>
          <Label>Departure date</Label>
          <Input type="date" name={`visit${index}_departure_date`} defaultValue={departureDate ?? ""} />
        </div>
        <TimeInput name={`visit${index}_departure_time`} label="Departure time" defaultValue={departureTime} />
        <div>
          <Label>Departure flight no.</Label>
          <Input
            name={`visit${index}_departure_flight_no`}
            defaultValue={departureFlightNo ?? ""}
            placeholder="TK1235"
          />
        </div>
        <div>
          <Label>Hotel name</Label>
          <Input
            name={`visit${index}_hotel_name`}
            defaultValue={hotelName ?? ""}
            list={`hotel-options-${index}`}
            autoComplete="off"
          />
          <datalist id={`hotel-options-${index}`}>
            {hotelOptions.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Room type</Label>
          <Input
            name={`visit${index}_room_type`}
            defaultValue={roomType ?? ""}
            placeholder="Double room"
            list={`room-options-${index}`}
            autoComplete="off"
          />
          <datalist id={`room-options-${index}`}>
            {roomTypeOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <HotelCostInput
          name={`visit${index}_hotel_cost`}
          defaultValue={hotelCost}
          deductCosts={deductCosts}
          visitDate={visitDate}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name={`visit${index}_hotel_arranged`}
            defaultChecked={hotelArranged ?? false}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
          />
          Hotel arranged
        </label>
      </div>
    </Card>
  );
}

function TimeInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
}) {
  return (
    <div>
      <Label>{label} (24h)</Label>
      <Input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder="14:30"
        inputMode="numeric"
        pattern="([01]\d|2[0-3]):[0-5]\d"
        title="Use 24-hour format, e.g. 14:30"
      />
    </div>
  );
}

function ExtraVisitsSection({
  patient,
  transfers,
  companies,
  pay,
}: {
  patient: Patient;
  transfers: Transfer[];
  companies: TransferCompany[];
  pay: PaymentContext;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const fieldsRef = useRef<HTMLDivElement>(null);

  function handleAdd() {
    const container = fieldsRef.current;
    if (!container) return;
    const formData = collectFormData(container);
    if (!String(formData.get("label") ?? "").trim()) {
      showToast("Reason is required");
      return;
    }
    startTransition(async () => {
      try {
        await addExtraVisit(patient.id, formData);
        showToast("Extra visit added ✓");
        setAdding(false);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to add extra visit");
      }
    });
  }

  return (
    <fieldset className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">Extra visits</legend>
      <p className="mb-3 text-xs text-slate-400">
        Any additional visits between visit 1 and visit 2 — e.g. fixing temporary teeth. Full detail: treatment,
        payment, notes and travel.
      </p>

      <div className="space-y-2">
        {patient.extra_visits.map((v) => (
          <ExtraVisitRow
            key={v.id}
            visit={v}
            patient={patient}
            transfers={transfers.filter((t) => t.extra_visit_id === v.id)}
            companies={companies}
            pay={pay}
          />
        ))}
      </div>

      {adding ? (
        <div ref={fieldsRef} className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <ExtraVisitFields deductCosts={pay.deductCosts} />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={handleAdd}>
              {pending ? "Adding…" : "Add visit"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setAdding(true)}>
          + Add extra visit
        </Button>
      )}
    </fieldset>
  );
}

/** Fetched lazily — only once the tab is actually opened, and cached per patient for the
 * rest of the modal's lifetime so flipping tabs back and forth doesn't refetch. */
function HistorySection({
  patient,
  profiles,
  active,
}: {
  patient: Patient;
  profiles: Profile[];
  active: boolean;
}) {
  // No reset-on-patient-change effect needed: the modal is keyed by patient id at the call
  // site (see PatientsClient), so this component remounts — with fresh state — whenever the
  // patient being edited changes.
  const [entries, setEntries] = useState<ActivityLogRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || entries !== null || loadError) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getPatientActivity(patient.id);
        if (!cancelled) setEntries(rows);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, entries, loadError, patient.id]);

  const nameById = new Map(profiles.map((p) => [p.id, p.display_name || "Unnamed seller"]));
  const patientNameById = new Map([[patient.id, patient.name]]);

  return (
    <fieldset className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">History</legend>
      {loadError ? (
        <p className="py-4 text-center text-sm text-red-600">{loadError}</p>
      ) : entries === null ? (
        <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-slate-700">{describeActivity(entry, nameById, patientNameById)}</span>
              <span className="shrink-0 text-xs text-slate-400">{formatActivityTime(entry.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

/** Shared field set for both the add form and the edit form — same shape as visit 1/2's fields + travel. */
function ExtraVisitFields({ visit, deductCosts = false }: { visit?: PatientExtraVisit; deductCosts?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 sm:col-span-2">
          <Label>Reason</Label>
          <Input name="label" required defaultValue={visit?.label} placeholder="Temporary crown fix" autoFocus />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" name="visit_date" defaultValue={visit?.visit_date ?? ""} />
        </div>
        <div>
          <Label>Expected (£)</Label>
          <Input type="number" step="0.01" min="0" name="expected" defaultValue={visit?.expected ?? ""} />
        </div>
        <div>
          <Label>Paid (£)</Label>
          <p className="py-2 text-sm text-slate-500" title="The sum of this visit's payments — record them under the visit">
            {visit?.actual != null ? `£${visit.actual}` : "—"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={visit?.status ?? "upcoming"}>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
        <div>
          <Label>Pax</Label>
          <Input type="number" min="1" max="50" step="1" name="pax" defaultValue={visit?.pax ?? 1} />
        </div>
      </div>
      <div>
        <Label>Treatment details</Label>
        <Textarea
          name="treatment"
          rows={2}
          defaultValue={visit?.treatment ?? ""}
          placeholder="What was done at this visit"
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} defaultValue={visit?.notes ?? ""} placeholder="Optional notes…" />
      </div>

      <fieldset className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Travel &amp; hotel</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Arrival date</Label>
            <Input type="date" name="arrival_date" defaultValue={visit?.arrival_date ?? ""} />
          </div>
          <TimeInput name="arrival_time" label="Arrival time" defaultValue={visit?.arrival_time} />
          <div>
            <Label>Arrival flight no.</Label>
            <Input name="arrival_flight_no" defaultValue={visit?.arrival_flight_no ?? ""} placeholder="TK1234" />
          </div>
          <div>
            <Label>Departure date</Label>
            <Input type="date" name="departure_date" defaultValue={visit?.departure_date ?? ""} />
          </div>
          <TimeInput name="departure_time" label="Departure time" defaultValue={visit?.departure_time} />
          <div>
            <Label>Departure flight no.</Label>
            <Input
              name="departure_flight_no"
              defaultValue={visit?.departure_flight_no ?? ""}
              placeholder="TK1235"
            />
          </div>
          <div>
            <Label>Hotel name</Label>
            <Input name="hotel_name" defaultValue={visit?.hotel_name ?? ""} />
          </div>
          <div>
            <Label>Room type</Label>
            <Input name="room_type" defaultValue={visit?.room_type ?? ""} placeholder="Double room" />
          </div>
          <HotelCostInput
            name="hotel_cost"
            defaultValue={visit?.hotel_cost}
            deductCosts={deductCosts}
            visitDate={visit?.visit_date}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="hotel_arranged"
              defaultChecked={visit?.hotel_arranged ?? false}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
            />
            Hotel arranged
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function ExtraVisitRow({
  visit,
  patient,
  transfers,
  companies,
  pay,
}: {
  visit: PatientExtraVisit;
  patient: Patient;
  pay: PaymentContext;
  transfers: Transfer[];
  companies: TransferCompany[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const fieldsRef = useRef<HTMLDivElement>(null);

  function handleSave() {
    const container = fieldsRef.current;
    if (!container) return;
    const formData = collectFormData(container);
    if (!String(formData.get("label") ?? "").trim()) {
      showToast("Reason is required");
      return;
    }
    startTransition(async () => {
      try {
        await updateExtraVisit(visit.id, formData);
        showToast("Extra visit saved ✓");
        setEditing(false);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to save extra visit");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${visit.label}"?`)) return;
    startTransition(async () => {
      try {
        await deleteExtraVisit(visit.id);
        showToast("Extra visit deleted ✓");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete extra visit");
      }
    });
  }

  if (editing) {
    return (
      <div ref={fieldsRef} className="rounded-lg border border-slate-200 bg-white p-3">
        <ExtraVisitFields visit={visit} deductCosts={pay.deductCosts} />
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  const flight = [visit.arrival_flight_no, visit.departure_flight_no].filter(Boolean).join(" / ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">{visit.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                visit.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {visit.status}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {visit.visit_date ?? "No date"}
            {visit.actual != null
              ? ` · £${visit.actual} paid`
              : visit.expected != null
              ? ` · £${visit.expected} expected`
              : ""}
            {` · ${visit.pax} pax`}
            {visit.hotel_name ? ` · ${visit.hotel_name}` : ""}
            {flight ? ` · ${flight}` : ""}
          </div>
          {(visit.arrival_date || visit.departure_date) && (
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
              {visit.arrival_date && (
                <span className={visit.arrival_transfer_arranged ? "text-emerald-600" : "text-amber-600"}>
                  {visit.arrival_transfer_arranged ? "✓ Arrival transfer" : "⚠ Arrival transfer"}
                </span>
              )}
              {visit.departure_date && (
                <span className={visit.departure_transfer_arranged ? "text-emerald-600" : "text-amber-600"}>
                  {visit.departure_transfer_arranged ? "✓ Departure transfer" : "⚠ Departure transfer"}
                </span>
              )}
              {visit.arrival_date && (
                <span className={visit.hotel_arranged ? "text-emerald-600" : "text-amber-600"}>
                  {visit.hotel_arranged ? "✓ Hotel" : "⚠ Hotel"}
                </span>
              )}
            </div>
          )}
          {visit.treatment && <div className="mt-0.5 text-xs text-slate-500">{visit.treatment}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-teal-600 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
      <PaymentsSection
        compact
        patientId={visit.patient_id}
        visitKey={visit.id}
        payments={patient.payments.filter((p) => p.extra_visit_id === visit.id)}
        expected={visit.expected}
        extrasTotal={extrasTotalFor(patient, visit.id)}
        profiles={pay.profiles}
        currentUserId={pay.currentUserId}
        surchargeRate={pay.surchargeRate}
        costs={pay.deductCosts ? visitCosts(patient, visit.id) : null}
      />
      <ExtrasSection
        compact
        patientId={visit.patient_id}
        visitKey={visit.id}
        extras={patient.extras.filter((e) => e.extra_visit_id === visit.id)}
        hotel={visit.hotel_name}
      />
      <TransfersSection
        compact
        patientId={visit.patient_id}
        patientName={patient.name}
        patientPhone={patient.phone}
        visitKey={visit.id}
        travel={extraVisitTravel(visit)}
        transfers={transfers}
        companies={companies}
        deductCosts={pay.deductCosts}
        defaults={pay.transferDefaults}
      />
    </div>
  );
}

function VisitFields({
  index,
  date,
  expected,
  actual,
  status,
  pax,
}: {
  index: 1 | 2;
  date?: string | null;
  expected?: number | null;
  actual?: number | null;
  status?: "upcoming" | "completed";
  pax?: number;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Visit {index} · Treatment &amp; payment</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" name={`visit${index}_date`} defaultValue={date ?? ""} />
        </div>
        <div>
          <Label>Expected (£)</Label>
          <Input type="number" step="0.01" min="0" name={`visit${index}_expected`} defaultValue={expected ?? ""} />
        </div>
        <div>
          <Label>Paid (£)</Label>
          <p className="py-2 text-sm text-slate-500" title="The sum of this visit's payments — record them in Payments below">
            {actual != null ? `£${actual}` : "—"}
          </p>
        </div>
        <div>
          <Label>Status</Label>
          <Select name={`visit${index}_status`} defaultValue={status ?? "upcoming"}>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
        <div>
          <Label>Pax</Label>
          <Input type="number" min="1" max="50" step="1" name={`visit${index}_pax`} defaultValue={pax ?? 1} />
          <p className="mt-1 text-xs text-slate-400">People travelling, patient included.</p>
        </div>
      </div>
    </Card>
  );
}
