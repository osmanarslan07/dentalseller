"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { isDueNow, todayIsoLocal } from "@/lib/balance";
import { visitCosts } from "@/lib/commission";
import { DriverMessagesMode, Patient, Profile, Seller, Transfer, TransferCompany, TransferDefaults } from "@/types";
import { deleteExtraVisit, sendPatientTelegramMessage, updatePatientFields, updateVisitFields } from "../actions";
import { KebabIcon, Menu, MenuItem } from "./Menu";
import { CheckIcon, EditButton, EditingChip, LABEL_CAPS, moneyIn, Pill, Section, Stepper, Toggle } from "./bits";
import { useCurrencies } from "@/components/currency";
import { currencySymbol } from "@/lib/money";
import { MoneyCard } from "./MoneyCard";
import { TransfersCard } from "./TransfersCard";
import { forVisit, nightsBetween, shortDate, travelOf, VisitView } from "./visits";
import { sellerLabel } from "@/lib/sellers";
import { useCan, useModule } from "@/components/permissions";
import { visitDiscountSetting, visitExpectedTotal } from "@/lib/commission";

export interface VisitTabProps {
  patient: Patient;
  visit: VisitView;
  /** Visit 1 — for "copy from visit 1" and visit 2's recall date. */
  visit1: VisitView;
  transfers: Transfer[];
  companies: TransferCompany[];
  profiles: Profile[];
  sellers: Seller[];
  currentUserId: string;
  surchargeRate: number;
  deductCosts: boolean;
  transferDefaults: TransferDefaults;
  driverMessages: DriverMessagesMode;
  hotelOptions: string[];
  roomTypeOptions: string[];
  /** Called after this visit is removed, so the page can move to another tab. */
  onRemoved: () => void;
}

/** The status shown for a visit: completed, under way (its day has come), or still ahead. */
export function visitStage(v: VisitView, today: string): { label: string; tone: "green" | "teal" | "slate" } {
  if (v.status === "completed") return { label: "Completed", tone: "green" };
  if (v.date && v.date <= today) return { label: "In progress", tone: "teal" };
  return { label: v.date ? "Upcoming" : "Not booked", tone: "slate" };
}

/** Everything about one visit: a summary strip, travel & hotel, money and transfers. */
export function VisitTab(props: VisitTabProps) {
  const { patient, visit, transfers, profiles, sellers, currentUserId, surchargeRate, deductCosts, companies, transferDefaults, driverMessages } = props;
  const today = todayIsoLocal();
  // flights, hotel and transfers belong to the Operations module
  const operations = useModule("operations");
  const payments = forVisit(patient.payments, visit.key);
  const extras = forVisit(patient.extras, visit.key);
  const visitTransfers = forVisit(transfers, visit.key);
  // price + extras − discount
  const owed = Math.round((visitExpectedTotal(patient, visit.key, visit.expected) ?? 0) * 100) / 100;
  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const dueNow = isDueNow({ key: visit.key, label: visit.label, date: visit.date, status: visit.status, owed, paid, due: owed - paid }, today);
  const seller = sellers.find((s) => s.id === patient.responsible_seller_id);
  const sellerName = seller ? sellerLabel(seller) : "the seller";

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip {...props} owed={owed} paid={paid} dueNow={dueNow} today={today} hasMoney={payments.length > 0 || extras.length > 0} hasTransfers={visitTransfers.length > 0} />

      <div className={`grid grid-cols-1 items-start gap-5 ${operations ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        {operations && <TravelCard {...props} />}
        <MoneyCard
          patientId={patient.id}
          deal={patient}
          patientHasPayments={patient.payments.length > 0}
          visit={visit}
          extras={extras}
          payments={payments}
          profiles={profiles}
          currentUserId={currentUserId}
          surchargeRate={surchargeRate}
          costs={deductCosts ? visitCosts(patient, visit.key) : null}
          dueNow={dueNow}
          sellerName={sellerName}
          discount={visitDiscountSetting(patient, visit.key)}
        />
      </div>

      {operations && (
      <TransfersCard
        key={visit.key}
        patientId={patient.id}
        patientName={patient.name}
        patientPhone={patient.phone}
        visitKey={visit.key}
        travel={travelOf(visit)}
        transfers={visitTransfers}
        companies={companies}
        defaults={transferDefaults}
        deductCosts={deductCosts}
        driverMessages={driverMessages}
      />
      )}
    </div>
  );
}

function Divider() {
  return <div className="hidden w-px self-stretch bg-slate-100 md:block" />;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-[13px] text-slate-600">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SummaryStrip({
  patient,
  visit,
  visit1,
  owed,
  paid,
  dueNow,
  today,
  hasMoney,
  hasTransfers,
  onRemoved,
}: VisitTabProps & { owed: number; paid: number; dueNow: boolean; today: string; hasMoney: boolean; hasTransfers: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editingDetails, setEditingDetails] = useState(false);
  const fmt = moneyIn(patient.currency);
  const canEdit = useCan("patients.edit");
  const stage = visitStage(visit, today);
  const due = Math.round((owed - paid) * 100) / 100;

  function run(action: () => Promise<unknown>, done: string, after?: () => void) {
    startTransition(async () => {
      try {
        await action();
        showToast(done);
        after?.();
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      }
    });
  }

  function setStatus(status: "completed" | "upcoming") {
    const task = status === "completed" && visit.key === "visit1" && patient.needs_visit2 && !patient.visit2_date;
    run(
      () => updateVisitFields(patient.id, visit.key, { status }),
      status === "completed"
        ? `${visit.label} marked completed ✓${task ? " A “Book visit 2” task was created." : ""}`
        : `${visit.label} reopened`
    );
  }

  function remove() {
    if (visit.key === "visit2") {
      if (!confirm("Remove visit 2? The patient will be treated as a single-visit patient.")) return;
      run(() => updatePatientFields(patient.id, { needs_visit2: false }), "Visit 2 removed", onRemoved);
    } else {
      if (!confirm(`Remove “${visit.label}”? Its extras and transfers are deleted with it.`)) return;
      run(() => deleteExtraVisit(visit.key), "Visit removed", onRemoved);
    }
  }

  const opsSheet = visit.date && (visit.kind === "extra" || patient.confirmation_date);
  const letter = visit.kind === "main" && visit.arrival_flight_no;
  const blockRemove = hasMoney ? "payments and extras must be moved first" : visit.key === "visit2" && hasTransfers ? "delete its transfers first" : null;
  const menuItems: MenuItem[] = [
    ...(canEdit ? [{ label: visit.kind === "extra" ? "Change date / details" : "Change date", onSelect: () => setEditingDetails(true) }] : []),
    {
      label: "Send to Telegram",
      hint: "to the seller’s chat",
      disabled: pending,
      onSelect: () => run(() => sendPatientTelegramMessage(patient.id, visit.key), "Sent to Telegram ✓"),
    },
    ...(opsSheet ? [{ label: "Open operations sheet", hint: "for the team", href: `/patients/${patient.id}/document?visit=${visit.kind === "main" ? visit.key.slice(-1) : visit.key}` }] : []),
    ...(letter ? [{ label: "Open confirmation letter", hint: "for the patient", href: `/patients/${patient.id}/confirmation-letter?visit=${visit.key.slice(-1)}` }] : []),
    ...(visit.key !== "visit1" && canEdit
      ? [{ label: "Remove this visit…", hint: blockRemove ?? "asks to confirm", danger: true, divider: true, disabled: !!blockRemove || pending, onSelect: remove }]
      : []),
  ];

  let primary: ReactNode;
  if (!canEdit) {
    primary = null;
  } else if (!visit.date) {
    primary = <Button onClick={() => setEditingDetails(true)}>Set visit date</Button>;
  } else if (visit.status !== "completed") {
    primary = (
      <Button onClick={() => setStatus("completed")} disabled={pending}>
        <CheckIcon size={16} />
        Mark visit completed
      </Button>
    );
  } else {
    primary = (
      <Button variant="secondary" onClick={() => setStatus("upcoming")} disabled={pending}>
        Reopen visit
      </Button>
    );
  }

  const recallMonths = patient.visit2_recall_months;
  const recallAround = visit1.date
    ? (() => {
        const [y, m] = visit1.date.split("-").map(Number);
        return new Date(y, m - 1 + recallMonths, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      })()
    : null;

  return (
    <section className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:px-5">
      <div className="flex min-w-[11rem] flex-col gap-0.5">
        <span className={LABEL_CAPS}>{visit.kind === "extra" ? "Extra visit" : "Treatment day"}</span>
        <span className={`text-xl font-bold ${visit.date ? "text-slate-900" : "text-slate-500"}`}>
          {visit.date ? shortDate(visit.date, true) : "Not booked yet"}
        </span>
      </div>
      <Divider />
      {visit.key === "visit2" && !visit.date ? (
        <Stat label="Recall">
          <span className="text-[15px] font-semibold text-slate-900">
            {recallMonths} month{recallMonths === 1 ? "" : "s"} after visit 1{recallAround ? ` → around ${recallAround}` : ""}
          </span>
          <span className="text-xs text-slate-500">
            {patient.visit1_status === "completed"
              ? "A “Book visit 2” task was created for the seller."
              : "A “Book visit 2” task is created when visit 1 is marked completed."}
          </span>
        </Stat>
      ) : (
        <div className="flex gap-7">
          <Stat label="Status">
            <Pill tone={stage.tone}>{stage.label}</Pill>
          </Stat>
          <Stat label="Pax">
            <span className="text-[15px] font-semibold text-slate-900">
              {visit.pax} {visit.pax === 1 ? "person" : "people"}
            </span>
          </Stat>
          {visit.kind === "extra" && visit.treatment && (
            <Stat label="Reason">
              <span className="max-w-xs text-[15px] font-semibold text-slate-900">{visit.treatment}</span>
            </Stat>
          )}
        </div>
      )}
      <Divider />
      <div className="flex gap-7">
        <Stat label="Owed">
          <span className="font-mono text-lg font-semibold text-slate-900">{fmt(owed)}</span>
        </Stat>
        <Stat label="Paid">
          <span className="font-mono text-lg font-semibold text-slate-900">{fmt(paid)}</span>
        </Stat>
        <Stat label={due > 0 && dueNow ? "Due" : "Balance"}>
          {owed === 0 && paid === 0 ? (
            <span className="text-slate-400">—</span>
          ) : due > 0 && dueNow ? (
            <span className="font-mono text-lg font-bold text-amber-700">{fmt(due)}</span>
          ) : due > 0 ? (
            <Pill>Upcoming</Pill>
          ) : due < 0 ? (
            <Pill tone="blue">Overpaid {fmt(-due)}</Pill>
          ) : (
            <Pill tone="green">Paid in full</Pill>
          )}
        </Stat>
      </div>
      <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
        <div className="grow md:grow-0 [&>button]:w-full">{primary}</div>
        <Menu trigger={<KebabIcon />} ariaLabel="Visit actions" heading="This visit" items={menuItems} buttonClassName="rounded-xl bg-slate-100 p-2.5 text-slate-700 hover:bg-slate-200" />
      </div>

      <VisitDetailsModal open={editingDetails} onClose={() => setEditingDetails(false)} patientId={patient.id} visit={visit} />
    </section>
  );
}

/** Date — and for an extra visit its reason, treatment and notes. */
function VisitDetailsModal({ open, onClose, patientId, visit }: { open: boolean; onClose: () => void; patientId: string; visit: VisitView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = { date: fd.get("date") };
    if (visit.kind === "extra") {
      patch.label = fd.get("label");
      patch.treatment = fd.get("treatment");
      patch.notes = fd.get("notes");
    }
    startTransition(async () => {
      try {
        await updateVisitFields(patientId, visit.key, patch);
        showToast(`${visit.kind === "extra" ? "Visit" : visit.label} saved ✓`);
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={visit.kind === "extra" ? `Edit ${visit.label}` : `${visit.label} date`}>
      <form onSubmit={submit} className="space-y-3">
        {visit.kind === "extra" && (
          <div>
            <Label>Name</Label>
            <Input name="label" required defaultValue={visit.label} placeholder="Temp crown fix" />
          </div>
        )}
        <div>
          <Label>Treatment day</Label>
          <Input type="date" name="date" defaultValue={visit.date ?? ""} autoFocus />
          {visit.kind === "main" && <p className="mt-1 text-xs text-slate-400">The treatment itself is on the Patient info tab.</p>}
        </div>
        {visit.kind === "extra" && (
          <>
            <div>
              <Label>Reason / treatment</Label>
              <Textarea name="treatment" rows={2} defaultValue={visit.treatment ?? ""} placeholder="Temporary crown came loose — re-cement" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} defaultValue={visit.notes ?? ""} placeholder="What was done, how it went…" />
            </div>
          </>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const TRAVEL_FIELDS = [
  "arrival_date",
  "arrival_time",
  "arrival_flight_no",
  "departure_date",
  "departure_time",
  "departure_flight_no",
  "hotel_name",
  "room_type",
  "hotel_cost",
] as const;
type TravelDraft = Partial<Record<(typeof TRAVEL_FIELDS)[number], string>>;

function TravelCard({ patient, visit, visit1, deductCosts, hotelOptions, roomTypeOptions }: VisitTabProps) {
  const router = useRouter();
  // the hotel is the clinic's own cost, in its main currency
  const fmt = moneyIn(useCurrencies().main);
  const { showToast } = useToast();
  const [editing, setEditing] = useState<TravelDraft | null>(null);
  const canEdit = useCan("patients.edit");
  const [pending, startTransition] = useTransition();

  const hasTravel = !!(visit.arrival_date || visit.departure_date || visit.hotel_name);
  const draftFrom = (v: VisitView, only?: readonly (typeof TRAVEL_FIELDS)[number][]): TravelDraft =>
    Object.fromEntries((only ?? TRAVEL_FIELDS).map((k) => [k, v[k] == null ? "" : String(v[k])]));

  function save(patch: Record<string, unknown>, done: string, after?: () => void) {
    startTransition(async () => {
      try {
        await updateVisitFields(patient.id, visit.key, patch);
        showToast(done);
        after?.();
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      }
    });
  }

  const nights = nightsBetween(visit.arrival_date, visit.departure_date);
  const canCopy = visit.key !== "visit1" && !!(visit1.hotel_name || visit1.room_type);

  return (
    <Section
      title="Travel & hotel"
      aside={editing && <EditingChip />}
      actions={!editing && hasTravel && <EditButton onClick={() => setEditing(draftFrom(visit))} />}
    >
      {editing ? (
        <TravelForm
          draft={editing}
          visit={visit}
          deductCosts={deductCosts}
          hotelOptions={hotelOptions}
          roomTypeOptions={roomTypeOptions}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(patch) => save(patch, "Travel & hotel saved ✓", () => setEditing(null))}
        />
      ) : !hasTravel ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-slate-300 px-5 py-6 text-center">
          <PlaneIcon className="text-slate-400" />
          <span className="text-sm font-semibold">No flights or hotel yet</span>
          <span className="max-w-xs text-[13px] text-slate-500">
            {visit.kind === "extra"
              ? "Leave empty if the patient is already here — local transfers only."
              : "Add them when the patient books — transfers can then be suggested in one click."}
          </span>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {canEdit && (
            <Button size="sm" onClick={() => setEditing(draftFrom(visit))}>
              Add flights &amp; hotel
            </Button>
            )}
            {canEdit && canCopy && (
              <Button
                size="sm"
                variant="secondary"
                title="Starts the form with visit 1’s hotel and room"
                onClick={() => setEditing({ ...draftFrom(visit), ...draftFrom(visit1, ["hotel_name", "room_type"]) })}
              >
                Copy hotel from visit 1
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TravelLine icon={<PlaneIcon />} label="Arrives">
            {visit.arrival_date ? (
              <>
                <span className="font-semibold">
                  {shortDate(visit.arrival_date)}
                  {visit.arrival_time && <span className="font-mono"> · {visit.arrival_time}</span>}
                </span>
                {visit.arrival_flight_no && (
                  <span className="text-xs text-slate-500">
                    Flight <span className="font-mono">{visit.arrival_flight_no}</span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">Not set</span>
            )}
          </TravelLine>
          <TravelLine icon={<PlaneIcon departing />} label="Departs">
            {visit.departure_date ? (
              <>
                <span className="font-semibold">
                  {shortDate(visit.departure_date)}
                  {visit.departure_time && <span className="font-mono"> · {visit.departure_time}</span>}
                </span>
                {visit.departure_flight_no && (
                  <span className="text-xs text-slate-500">
                    Flight <span className="font-mono">{visit.departure_flight_no}</span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">Not set</span>
            )}
          </TravelLine>
          <div className="border-t border-slate-100" />
          <TravelLine icon={<BedIcon />} label="Hotel">
            {visit.hotel_name ? (
              <>
                <span className="font-semibold">
                  {visit.hotel_name}
                  {visit.room_type && ` · ${visit.room_type}`}
                </span>
                <span className="text-xs text-slate-500">
                  {[
                    visit.arrival_date && visit.departure_date
                      ? `${shortDate(visit.arrival_date).replace(/^\w+ /, "")} → ${shortDate(visit.departure_date).replace(/^\w+ /, "")}`
                      : null,
                    nights ? `${nights} night${nights === 1 ? "" : "s"}` : null,
                    visit.hotel_cost != null ? `clinic pays ${fmt(visit.hotel_cost)}` : "patient pays own hotel",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <div className="mt-1.5">
                  <Toggle
                    on={visit.hotel_arranged}
                    disabled={pending}
                    onChange={(on) => save({ hotel_arranged: on }, on ? "Hotel marked as booked ✓" : "Hotel marked as not booked")}
                  >
                    {visit.hotel_arranged ? "Hotel booked" : "Mark hotel booked"}
                  </Toggle>
                </div>
              </>
            ) : (
              <span className="text-slate-400">No hotel</span>
            )}
          </TravelLine>
        </div>
      )}

      {!editing && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[13px] text-slate-600">
          <span>People travelling (patient included)</span>
          <Stepper label="people" value={visit.pax} disabled={pending} onChange={(n) => save({ pax: n }, `Pax set to ${n} ✓`)} />
        </div>
      )}

      {visit.kind === "extra" && !editing && (visit.notes || visit.treatment) && (
        <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
          <span className="text-[13px] text-slate-600">Treatment notes</span>
          <p className="whitespace-pre-line text-sm leading-relaxed">{[visit.treatment, visit.notes].filter(Boolean).join("\n")}</p>
        </div>
      )}
    </Section>
  );
}

function TravelLine({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">{icon}</div>
      <div className="flex min-w-0 flex-col text-sm">
        <span className="text-xs text-slate-500">{label}</span>
        {children}
      </div>
    </div>
  );
}

function PlaneIcon({ departing, className = "" }: { departing?: boolean; className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {departing ? (
        <path d="M2 20h20M3 15l12-4 3-3.5 2 .5-1.5 4.5-13 5z" />
      ) : (
        <path d="M2 20h20M4.5 14.5l3-.5 2.5-6 2 .5-1 5.5 5-1 2-3 1.5.5-1 4.5-12 2.5z" />
      )}
    </svg>
  );
}

function BedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-7a2 2 0 012-2h14a2 2 0 012 2v7M3 18v2M21 18v2M3 14h18" />
      <circle cx="7.5" cy="11.5" r="1.2" />
    </svg>
  );
}

/** Before the current month — changing such a visit's costs changes a month already paid out. */
function isPastMonth(date: string | null | undefined): boolean {
  if (!date) return false;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return date.slice(0, 7) < current;
}

function TravelForm({
  draft,
  visit,
  deductCosts,
  hotelOptions,
  roomTypeOptions,
  pending,
  onCancel,
  onSave,
}: {
  draft: TravelDraft;
  visit: VisitView;
  deductCosts: boolean;
  hotelOptions: string[];
  roomTypeOptions: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const { main: mainCurrency } = useCurrencies();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave(Object.fromEntries(TRAVEL_FIELDS.map((k) => [k, String(fd.get(k) ?? "")])));
  }
  const time = { inputMode: "numeric" as const, pattern: "([01]\\d|2[0-3]):[0-5]\\d", title: "Use 24-hour format, e.g. 14:30", placeholder: "14:30" };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="col-span-2 sm:col-span-1">
          <Label>Arrival date</Label>
          <Input type="date" name="arrival_date" defaultValue={draft.arrival_date} autoFocus />
        </div>
        <div>
          <Label>Time</Label>
          <Input name="arrival_time" defaultValue={draft.arrival_time} {...time} />
        </div>
        <div>
          <Label>Flight</Label>
          <Input name="arrival_flight_no" defaultValue={draft.arrival_flight_no} placeholder="TK1987" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Departure date</Label>
          <Input type="date" name="departure_date" defaultValue={draft.departure_date} />
        </div>
        <div>
          <Label>Time</Label>
          <Input name="departure_time" defaultValue={draft.departure_time} {...time} />
        </div>
        <div>
          <Label>Flight</Label>
          <Input name="departure_flight_no" defaultValue={draft.departure_flight_no} placeholder="TK1988" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Hotel</Label>
          <Input name="hotel_name" defaultValue={draft.hotel_name} list={`hotels-${visit.key}`} autoComplete="off" />
          <datalist id={`hotels-${visit.key}`}>
            {hotelOptions.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Room</Label>
          <Input name="room_type" defaultValue={draft.room_type} placeholder="Double" list={`rooms-${visit.key}`} autoComplete="off" />
          <datalist id={`rooms-${visit.key}`}>
            {roomTypeOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Hotel cost ({currencySymbol(mainCurrency)})</Label>
          <Input type="number" step="0.01" min="0" name="hotel_cost" defaultValue={draft.hotel_cost} placeholder="Clinic's cost" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Hotel cost empty = the patient pays their own hotel.{deductCosts && " The clinic’s cost is deducted before commission."}
      </p>
      {deductCosts && isPastMonth(visit.date) && (
        <p className="text-xs text-amber-700">⚠ This visit is in a past month — changing the cost changes that month&apos;s commission.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
