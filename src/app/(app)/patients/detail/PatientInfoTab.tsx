"use client";

import type { CoordinatorOption } from "@/lib/coordinators";
import { FormEvent, ReactNode, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { isDueNow, todayIsoLocal } from "@/lib/balance";
import { visitExpectedTotal } from "@/lib/commission";
import { Patient, PatientFile, Profile, Seller } from "@/types";
import { SellerPick, SellerPicker } from "@/components/SellerPicker";
import { sellerLabel } from "@/lib/sellers";
import { reassignPatient, setPatientCoordinator, updatePatientFields } from "../actions";
import { EditButton, EditingChip, Field, gbp, Pill, Section, Toggle } from "./bits";
import { forVisit, shortDate, VisitView } from "./visits";
import { useCan } from "@/components/permissions";
import { FilesCard } from "./FilesCard";

export interface DocLink {
  label: string;
  hint: string;
  href: string;
}

/** Operations sheets (for the team) and confirmation letters (for the patient) that can be
 * produced so far — they need a date / flights to say anything useful. */
export function documentLinks(p: Patient, visits: VisitView[]): DocLink[] {
  const docs: DocLink[] = [];
  for (const v of visits) {
    if (v.kind === "main" && v.arrival_flight_no) {
      docs.push({ label: `Confirmation letter · ${v.label}`, hint: "for the patient", href: `/patients/${p.id}/confirmation-letter?visit=${v.key.slice(-1)}` });
    }
  }
  for (const v of visits) {
    if (!v.date || (v.kind === "main" && !p.confirmation_date)) continue;
    docs.push({
      label: `Operations sheet · ${v.label}`,
      hint: "for the team",
      href: `/patients/${p.id}/document?visit=${v.kind === "main" ? v.key.slice(-1) : v.key}`,
    });
  }
  return docs;
}

/** A read-only card that turns into its own little form — Save writes just these fields. */
function EditCard({
  title,
  view,
  form,
  toPatch,
  saved,
  onSave,
  extraActions,
}: {
  title: string;
  view: ReactNode;
  form: ReactNode;
  toPatch: (fd: FormData) => Record<string, unknown>;
  saved: string;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  extraActions?: ReactNode;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const patch = toPatch(new FormData(e.currentTarget));
    startTransition(async () => {
      try {
        await onSave(patch);
        showToast(saved);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Section
      title={title}
      aside={editing && <EditingChip />}
      actions={
        !editing && (
          <>
            {extraActions}
            <EditButton onClick={() => setEditing(true)} />
          </>
        )
      }
    >
      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {form}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        view
      )}
    </Section>
  );
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export function PatientInfoTab({
  patient,
  visits,
  profiles,
  sellers,
  currentUserId,
  canAssignSellers,
  coordinators,
  files,
  onOpenVisit,
}: {
  coordinators: CoordinatorOption[];
  files: PatientFile[];
  patient: Patient;
  visits: VisitView[];
  profiles: Profile[];
  sellers: Seller[];
  currentUserId: string;
  canAssignSellers: boolean;
  onOpenVisit: (key: string) => void;
}) {
  const save = (patch: Record<string, unknown>) => updatePatientFields(patient.id, patch);
  const letterItems = (patient.letter_treatment_items ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const komoIsLink = !!patient.komo_reference && /^https?:\/\//i.test(patient.komo_reference);
  const docs = documentLinks(patient, visits);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <EditCard
          title="Contact"
          saved="Contact saved ✓"
          onSave={save}
          toPatch={(fd) => ({ name: str(fd, "name"), phone: str(fd, "phone") })}
          view={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name">{patient.name}</Field>
              <Field label="Phone (WhatsApp)">
                <span className="font-mono">{patient.phone || <span className="font-sans font-normal text-slate-400">Not added</span>}</span>
              </Field>
            </div>
          }
          form={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Full name</Label>
                <Input name="name" required defaultValue={patient.name} autoFocus />
              </div>
              <div>
                <Label>Phone (WhatsApp)</Label>
                <Input name="phone" type="tel" defaultValue={patient.phone ?? ""} placeholder="+44 7700 900123" autoComplete="off" />
                <p className="mt-1 text-xs text-slate-400">With country code, e.g. +44.</p>
              </div>
            </div>
          }
        />

        <TreatmentCard patient={patient} letterItems={letterItems} onSave={save} />

        <SaleCard patient={patient} coordinators={coordinators} sellers={sellers} currentUserId={currentUserId} canAssignSellers={canAssignSellers} komoIsLink={komoIsLink} onSave={save} />

        <EditCard
          title="Notes"
          saved="Notes saved ✓"
          onSave={save}
          toPatch={(fd) => ({ notes: str(fd, "notes") })}
          view={
            patient.notes ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{patient.notes}</p>
            ) : (
              <p className="text-sm text-slate-400">No notes yet.</p>
            )
          }
          form={<Textarea name="notes" rows={4} defaultValue={patient.notes ?? ""} placeholder="Anything the team should know…" autoFocus />}
        />
      </div>

      <div className="flex flex-col gap-5">
        <VisitsAtAGlance patient={patient} visits={visits} onOpenVisit={onOpenVisit} />
        <FilesCard patientId={patient.id} files={files} profiles={profiles} currentUserId={currentUserId} />
        <Section title="Documents">
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400">Appear once a visit has a date (operations sheet) or flights (confirmation letter).</p>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  target="_blank"
                  className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-teal-700" aria-hidden>
                    <path d="M7 3h7l5 5v13H7z" />
                    <path d="M14 3v5h5" />
                  </svg>
                  <span className="grow font-medium">{d.label}</span>
                  <span className="text-xs text-slate-500">{d.hint}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function TreatmentCard({
  patient,
  letterItems,
  onSave,
}: {
  patient: Patient;
  letterItems: string[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <EditCard
      title="Treatment"
      saved="Treatment saved ✓"
      onSave={onSave}
      toPatch={(fd) => ({
        treatment: str(fd, "treatment"),
        letter_treatment_items: str(fd, "letter_treatment_items"),
        needs_visit2: fd.get("needs_visit2") === "on",
        ...(fd.get("needs_visit2") === "on" ? { visit2_recall_months: str(fd, "visit2_recall_months") } : {}),
      })}
      view={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Treatment (short label)">{patient.treatment || <span className="font-normal text-slate-400">Not set</span>}</Field>
          <Field label="Visits">
            {patient.needs_visit2 ? `2 stages · visit 2 recall ${patient.visit2_recall_months} months` : "Single visit"}
            {patient.extra_visits.length > 0 && ` · ${patient.extra_visits.length} extra`}
          </Field>
          <Field label="On the confirmation letter" className="sm:col-span-2">
            {letterItems.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 font-normal">
                {letterItems.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : (
              <span className="font-normal text-slate-400">Uses the treatment label</span>
            )}
          </Field>
        </div>
      }
      form={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Treatment (short label)</Label>
            <Input name="treatment" defaultValue={patient.treatment ?? ""} placeholder="Full mouth zirconium crowns" autoFocus />
            <p className="mt-1 text-xs text-slate-400">Shown on the dashboard, calendar and upcoming visits.</p>
          </div>
          <div className="sm:col-span-2">
            <Label>On the confirmation letter</Label>
            <Textarea
              name="letter_treatment_items"
              rows={2}
              defaultValue={patient.letter_treatment_items ?? ""}
              placeholder="12x Nucleoss T6 dental implants, 24x Dental Direkt zirconium crowns"
            />
            <p className="mt-1 text-xs text-slate-400">Comma-separated — each item is a bullet. Empty = the treatment label.</p>
          </div>
          <SecondVisitFields initial={patient.needs_visit2} recallMonths={patient.visit2_recall_months} />
        </div>
      }
    />
  );
}

/** Mounted fresh each time the card opens, so a cancelled toggle doesn't stick. */
function SecondVisitFields({ initial, recallMonths }: { initial: boolean; recallMonths: number }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
      <Toggle name="needs_visit2" on={on} onChange={setOn}>
        Needs a second visit
      </Toggle>
      {on && (
        <div className="w-44">
          <Label>Visit 2 recall (months)</Label>
          <Input type="number" min="1" step="1" name="visit2_recall_months" defaultValue={recallMonths} />
        </div>
      )}
    </div>
  );
}

function SaleCard({
  patient,
  coordinators,
  sellers,
  currentUserId,
  canAssignSellers,
  komoIsLink,
  onSave,
}: {
  patient: Patient;
  coordinators: CoordinatorOption[];
  sellers: Seller[];
  currentUserId: string;
  canAssignSellers: boolean;
  komoIsLink: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [reassigning, setReassigning] = useState(false);
  const [pick, setPick] = useState<SellerPick>({ sellerId: patient.responsible_seller_id, newName: null });
  const [pending, startTransition] = useTransition();
  const canEdit = useCan("patients.edit");
  const canReassign = canEdit && (patient.responsible_seller_id === currentUserId || canAssignSellers);
  const seller = sellers.find((s) => s.id === patient.responsible_seller_id);
  const sellerName = sellerLabel(seller);

  function reassign() {
    if (pick.newName == null && pick.sellerId === patient.responsible_seller_id) return setReassigning(false);
    if (pick.newName != null && !pick.newName.trim()) return showToast("Type the seller's name", "error");
    if (!confirm("Reassign this patient to another seller? They will earn the commission from now on.")) return;
    startTransition(async () => {
      try {
        await reassignPatient(patient.id, pick.newName != null ? { newSellerName: pick.newName } : { sellerId: pick.sellerId });
        showToast("Patient reassigned ✓");
        setReassigning(false);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to reassign patient", "error");
      }
    });
  }

  return (
    <EditCard
      title="Sale"
      saved="Sale details saved ✓"
      onSave={onSave}
      toPatch={(fd) => ({ confirmation_date: str(fd, "confirmation_date"), komo_reference: str(fd, "komo_reference") })}
      view={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div id="reassign" className="flex flex-col gap-0.5 text-sm">
            <span className="text-xs text-slate-500">Seller</span>
            {reassigning ? (
              <div className="flex flex-col gap-2">
                <SellerPicker
                  sellers={sellers}
                  value={pick}
                  onChange={setPick}
                  currentUserId={currentUserId}
                  allowNew={canAssignSellers}
                  disabled={pending}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setReassigning(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={reassign} disabled={pending}>
                    {pending ? "Saving…" : "Reassign"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="font-semibold">
                  {sellerName}
                  {seller && !seller.profile_id && <span className="ml-1.5 text-xs font-normal text-slate-400">no account</span>}
                </span>
                {canReassign && (
                  <button
                    type="button"
                    onClick={() => {
                      setPick({ sellerId: patient.responsible_seller_id, newName: null });
                      setReassigning(true);
                    }}
                    className="self-start text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Reassign…
                  </button>
                )}
              </>
            )}
          </div>
          <CoordinatorField patient={patient} coordinators={coordinators} currentUserId={currentUserId} />
          <Field label="Confirmed">{patient.confirmation_date ? shortDate(patient.confirmation_date, true) : <span className="font-normal text-slate-400">Not set</span>}</Field>
          <Field label="Komo reference">
            {patient.komo_reference ? (
              komoIsLink ? (
                <a href={patient.komo_reference} target="_blank" rel="noopener noreferrer" className="break-all text-teal-700 hover:text-teal-800">
                  {patient.komo_reference.replace(/^https?:\/\/(www\.)?/i, "")} ↗
                </a>
              ) : (
                patient.komo_reference
              )
            ) : (
              <span className="font-normal text-slate-400">Not set</span>
            )}
          </Field>
        </div>
      }
      form={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Confirmation date</Label>
            <Input type="date" name="confirmation_date" defaultValue={patient.confirmation_date ?? ""} autoFocus />
          </div>
          <div>
            <Label>Komo reference</Label>
            <Input name="komo_reference" defaultValue={patient.komo_reference ?? ""} placeholder="Lead link or ID" />
          </div>
          <p className="text-xs text-slate-400 sm:col-span-2">Seller and coordinator are changed on the card itself, not here.</p>
        </div>
      }
    />
  );
}

/** The team member who follows this patient up. Anyone who can edit the patient can change it. */
/** Only members who can edit patients are offered (the database checks the same); the
 * current coordinator stays shown even if they've since been deactivated. */
function CoordinatorField({
  patient,
  coordinators,
  currentUserId,
}: {
  patient: Patient;
  coordinators: CoordinatorOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(patient.coordinator_id ?? "");
  const [pending, startTransition] = useTransition();
  const canEdit = useCan("patients.edit");
  const current = coordinators.find((c) => c.id === patient.coordinator_id);
  const team = coordinators.filter((c) => c.pickable || c.id === patient.coordinator_id);

  function save() {
    if (value === (patient.coordinator_id ?? "")) return setEditing(false);
    startTransition(async () => {
      try {
        await setPatientCoordinator(patient.id, value || null);
        showToast("Coordinator saved ✓");
        setEditing(false);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to save coordinator", "error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="text-xs text-slate-500">Coordinator</span>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Select value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} autoFocus aria-label="Coordinator">
            <option value="">No coordinator — the seller follows up</option>
            {team.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === currentUserId ? " (you)" : ""}
                {c.pickable ? "" : " (can no longer coordinate)"}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span className="font-semibold">
            {current ? current.name : patient.coordinator_id ? "Former member" : <span className="font-normal text-slate-400">None — the seller follows up</span>}
          </span>
          {canEdit && (
          <button
            type="button"
            onClick={() => {
              setValue(patient.coordinator_id ?? "");
              setEditing(true);
            }}
            className="self-start text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            Change…
          </button>
          )}
        </>
      )}
    </div>
  );
}

function VisitsAtAGlance({ patient, visits, onOpenVisit }: { patient: Patient; visits: VisitView[]; onOpenVisit: (key: string) => void }) {
  const today = todayIsoLocal();
  const rows = visits.map((v) => {
    const owed = Math.round((visitExpectedTotal(patient, v.key, v.expected) ?? 0) * 100) / 100;
    const paid = Math.round(forVisit(patient.payments, v.key).reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const due = Math.round((owed - paid) * 100) / 100;
    const now = isDueNow({ key: v.key, label: v.label, date: v.date, status: v.status, owed, paid, due }, today);
    return { v, owed, paid, due, now };
  });
  const totals = rows.reduce((t, r) => ({ owed: t.owed + r.owed, paid: t.paid + r.paid }), { owed: 0, paid: 0 });
  const dueNow = rows.filter((r) => r.now && r.due > 0).reduce((s, r) => s + r.due, 0);
  const later = rows.filter((r) => !r.now && r.due > 0);
  const cols = "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_6rem] gap-2";

  return (
    <Section title="All visits at a glance">
      <div className={`${cols} border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500`}>
        <span>Visit</span>
        <span className="text-right">Owed</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Balance</span>
      </div>
      <div className="-my-1 flex flex-col">
        {rows.map(({ v, owed, paid, due, now }) => (
          <button key={v.key} type="button" onClick={() => onOpenVisit(v.key)} className={`${cols} items-center rounded-lg py-1.5 text-left text-sm hover:bg-slate-50`}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{v.label}</span>
              <span className="text-xs text-slate-500">{v.date ? shortDate(v.date) : "Not booked"}</span>
            </span>
            <span className="text-right font-mono">{gbp(owed)}</span>
            <span className="text-right font-mono">{gbp(paid)}</span>
            <span className="text-right">
              {owed === 0 && paid === 0 ? (
                <span className="text-slate-400">—</span>
              ) : due < 0 ? (
                <Pill tone="blue">Overpaid</Pill>
              ) : due === 0 ? (
                <Pill tone="green">Paid</Pill>
              ) : now ? (
                <Pill tone="amber">{gbp(due)} due</Pill>
              ) : (
                <Pill>Upcoming</Pill>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className={`${cols} border-t-2 border-slate-900 pt-2 text-sm font-bold`}>
        <span>Total</span>
        <span className="text-right font-mono">{gbp(totals.owed)}</span>
        <span className="text-right font-mono">{gbp(totals.paid)}</span>
        <span className={`text-right ${dueNow > 0 ? "text-amber-700" : "text-emerald-700"}`}>{dueNow > 0 ? `${gbp(dueNow)} due` : "Nothing due"}</span>
      </div>
      {later.length > 0 && (
        <p className="text-xs text-slate-500">
          {later.map((r) => `${r.v.label}’s ${gbp(r.due)}`).join(", ")} {later.length === 1 ? "isn’t" : "aren’t"} due until the visit starts.
        </p>
      )}
    </Section>
  );
}
