"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCelebrationSound } from "@/components/celebration-sound";
import { fireConfetti, playChime } from "@/lib/celebrate";
import { formatDate } from "@/lib/format";
import { todayIsoLocal } from "@/lib/balance";
import { Patient, Seller } from "@/types";
import { SellerPick, SellerPicker } from "@/components/SellerPicker";
import { sellerNameMap } from "@/lib/sellers";
import { createPatient } from "./actions";
import { Toggle } from "./detail/bits";
import { pickableSellers } from "@/lib/sellers";
import type { CoordinatorOption } from "@/lib/coordinators";

/** Carried over from the patient being duplicated but not shown — the rest of the group
 * booking (same flights and hotel), edited later on the patient page like anyone else's. */
const CARRIED_FIELDS = [
  "letter_treatment_items",
  "notes",
  "visit1_pax",
  "visit2_pax",
  ...[1, 2].flatMap((n) =>
    ["arrival_date", "arrival_time", "arrival_flight_no", "departure_date", "departure_time", "departure_flight_no", "hotel_name", "room_type", "hotel_cost"].map(
      (f) => `visit${n}_${f}`
    )
  ),
] as const;

const RECALL_OPTIONS = [1, 2, 3, 4, 6, 9, 12];

/** The short start form — who, what, when and how much. Flights, hotel, transfers and
 * extras go on the patient page right after. */
export function NewPatientForm({
  duplicateFrom,
  sellers,
  currentUserId,
  canAssignSellers,
  coordinators,
  existingPatients,
}: {
  /** Members who can coordinate patients (patients.edit). */
  coordinators: CoordinatorOption[];
  /** Prefill from an existing patient — for group bookings sharing a flight/hotel. */
  duplicateFrom: Patient | null;
  sellers: Seller[];
  currentUserId: string;
  /** sellers.assign: record a patient for any seller, or type a new one; otherwise you add your own. */
  canAssignSellers: boolean;
  /** To warn when the name matches someone already entered. */
  existingPatients: Pick<Patient, "id" | "name" | "confirmation_date" | "responsible_seller_id">[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // yourself when you sell; otherwise (a coordinator) the first seller on the list
  const [seller, setSeller] = useState<SellerPick>(() => {
    const pickable = pickableSellers(sellers, "");
    const me = pickable.find((s) => s.id === currentUserId);
    return { sellerId: me?.id ?? pickable[0]?.id ?? currentUserId, newName: null };
  });
  // null = not chosen: you when you enter the patient for someone else, else nobody (the
  // seller follows up) — the same default as before there was a picker
  const [coordinatorChoice, setCoordinatorChoice] = useState<string | null>(null);
  const sellingMyself = seller.newName == null && seller.sellerId === currentUserId;
  const coordinatorId = coordinatorChoice ?? (sellingMyself ? "" : currentUserId);
  const [needsVisit2, setNeedsVisit2] = useState(duplicateFrom ? duplicateFrom.needs_visit2 : true);
  const src = duplicateFrom;
  const recall = src?.visit2_recall_months ?? 3;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    const name = String(formData.get("name") ?? "").trim();
    const dupes = existingPatients.filter((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (dupes.length > 0) {
      const names = sellerNameMap(sellers);
      const sellerNameFor = (id: string) => names.get(id) ?? "Unknown seller";
      const details = dupes
        .map((p) => `• Confirmed ${formatDate(p.confirmation_date)} — responsible: ${sellerNameFor(p.responsible_seller_id)}`)
        .join("\n");
      if (!confirm(`A patient named "${name}" already exists:\n\n${details}\n\nAdd another with the same name anyway?`)) return;
    }

    startTransition(async () => {
      try {
        const { id, celebration } = await createPatient(formData);
        fireConfetti();
        if (soundEnabled) playChime();
        showToast(celebration.message);
        router.replace(id ? `/patients/${id}` : "/patients");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Link href="/patients" className="self-start text-[13px] font-medium text-teal-700 hover:text-teal-800">
          ← Patients
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[26px]">
          {src ? `New patient · group with ${src.name}` : "New patient"}
        </h1>
        <p className="text-sm text-slate-500">
          {src
            ? `Flights, hotel and visit dates are copied from ${src.name}. Name, phone, Komo reference and payments start empty.`
            : "Just the essentials — flights, hotel, transfers and extras go on the patient page right after."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input name="name" required placeholder="Jane Smith" autoFocus />
          </div>
          <div>
            <Label>Phone (WhatsApp)</Label>
            <Input name="phone" type="tel" placeholder="+44 7700 900123" autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <Label>Treatment</Label>
            <Input name="treatment" defaultValue={src?.treatment ?? ""} placeholder="Full mouth zirconium crowns" />
          </div>
          <div>
            <Label>Confirmation date</Label>
            <Input type="date" name="confirmation_date" defaultValue={todayIsoLocal()} />
          </div>
          <div>
            <Label>Komo reference</Label>
            <Input name="komo_reference" placeholder="Lead link or ID" />
          </div>
          {canAssignSellers && (
            <div className="sm:col-span-2">
              <Label>Seller</Label>
              <SellerPicker sellers={sellers} value={seller} onChange={setSeller} currentUserId={currentUserId} allowNew formFields />
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>Coordinator — who follows the patient up</Label>
            <input type="hidden" name="coordinator_id" value={coordinatorId} />
            <Select value={coordinatorId} onChange={(e) => setCoordinatorChoice(e.target.value)} aria-label="Coordinator">
              <option value="">Nobody — the seller follows up</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="border-t border-slate-100" />

        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visits</span>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]">
            <span className="col-span-2 pb-2 text-sm font-semibold sm:col-span-1">Visit 1</span>
            <div>
              <Label>Date</Label>
              <Input type="date" name="visit1_date" aria-label="Visit 1 date" defaultValue={src?.visit1_date ?? ""} />
            </div>
            <div>
              <Label>Price (£)</Label>
              <Input type="number" min="0" step="0.01" name="visit1_expected" aria-label="Visit 1 price" defaultValue={src?.visit1_expected ?? ""} />
            </div>

            <div className="col-span-2 pb-1 sm:col-span-1">
              <Toggle name="needs_visit2" on={needsVisit2} onChange={setNeedsVisit2}>
                Visit 2
              </Toggle>
            </div>
            {needsVisit2 ? (
              <>
                <div>
                  <Label>Recall</Label>
                  <Select name="visit2_recall_months" aria-label="Visit 2 recall" defaultValue={String(recall)}>
                    {[...new Set([...RECALL_OPTIONS, recall])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        After {m} month{m === 1 ? "" : "s"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Price (£)</Label>
                  <Input type="number" min="0" step="0.01" name="visit2_expected" aria-label="Visit 2 price" defaultValue={src?.visit2_expected ?? ""} />
                </div>
                {src?.visit2_date && <input type="hidden" name="visit2_date" value={src.visit2_date} />}
              </>
            ) : (
              <p className="col-span-2 pb-2 text-sm text-slate-500">Single visit — you can add visit 2 later from the patient page.</p>
            )}
          </div>
        </div>

        {src &&
          CARRIED_FIELDS.map((k) => {
            const v = src[k as keyof Patient];
            return v == null || v === "" ? null : <input key={k} type="hidden" name={k} value={String(v)} />;
          })}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/patients")}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create patient →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
