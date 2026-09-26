"use client";

import { DateInput } from "@/components/DateInput";
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
import { NamedPatient, findPatientsNamed } from "@/lib/patient-lookup-actions";
import { Toggle } from "./detail/bits";
import { pickableSellers } from "@/lib/sellers";
import type { CoordinatorOption } from "@/lib/coordinators";
import { useCurrencies } from "@/components/currency";
import { currencySymbol } from "@/lib/money";
import { useT } from "@/i18n/client";

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
}: {
  /** Members who can coordinate patients (patients.edit). */
  coordinators: CoordinatorOption[];
  /** Prefill from an existing patient — for group bookings sharing a flight/hotel. */
  duplicateFrom: Patient | null;
  sellers: Seller[];
  currentUserId: string;
  /** sellers.assign: record a patient for any seller, or type a new one; otherwise you add your own. */
  canAssignSellers: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
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
  // The deal currency (only asked when the clinic deals in several): the one picked, else the
  // duplicated patient's, else the chosen seller's usual one, else the main currency.
  const currencies = useCurrencies();
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(
    src && currencies.list.includes(src.currency) ? src.currency : null
  );
  const usual = seller.newName == null ? sellers.find((s) => s.id === seller.sellerId)?.default_currency : null;
  const currency = currencyChoice ?? (usual && currencies.list.includes(usual) ? usual : currencies.main);
  const sym = currencySymbol(currency);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    const name = String(formData.get("name") ?? "").trim();
    // warn when the name matches someone already entered
    let dupes: NamedPatient[] = [];
    setChecking(true);
    try {
      dupes = await findPatientsNamed(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong"));
      return;
    } finally {
      setChecking(false);
    }
    if (dupes.length > 0) {
      const names = sellerNameMap(sellers);
      const sellerNameFor = (id: string) => names.get(id) ?? t("Unknown seller");
      const details = dupes
        .map((p) => `• ${t("Confirmed {date} — responsible: {name}", { date: formatDate(p.confirmation_date), name: sellerNameFor(p.responsible_seller_id) })}`)
        .join("\n");
      if (!confirm(t("A patient named \"{name}\" already exists:\n\n{details}\n\nAdd another with the same name anyway?", { name, details }))) return;
    }

    startTransition(async () => {
      try {
        const { id, celebration } = await createPatient(formData);
        fireConfetti();
        if (soundEnabled) playChime();
        showToast(celebration.message);
        router.replace(id ? `/patients/${id}` : "/patients");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Something went wrong"));
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Link href="/patients" className="self-start text-[13px] font-medium text-teal-700 hover:text-teal-800">
          ← {t("Patients")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[26px]">
          {src ? t("New patient · group with {name}", { name: src.name }) : t("New patient")}
        </h1>
        <p className="text-sm text-slate-500">
          {src
            ? t("Flights, hotel and visit dates are copied from {name}. Name, phone, Komo reference and payments start empty.", { name: src.name })
            : t("Just the essentials — flights, hotel, transfers and extras go on the patient page right after.")}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("Full name")}</Label>
            <Input name="name" required placeholder="Jane Smith" autoFocus />
          </div>
          <div>
            <Label>{t("Phone (WhatsApp)")}</Label>
            <Input name="phone" type="tel" placeholder="+44 7700 900123" autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("Treatment")}</Label>
            <Input name="treatment" defaultValue={src?.treatment ?? ""} placeholder={t("Full mouth zirconium crowns")} />
          </div>
          <div>
            <Label>{t("Confirmation date")}</Label>
            <DateInput name="confirmation_date" defaultValue={todayIsoLocal()} />
          </div>
          <div>
            <Label>{t("Komo reference")}</Label>
            <Input name="komo_reference" placeholder={t("Lead link or ID")} />
          </div>
          {canAssignSellers && (
            <div className="sm:col-span-2">
              <Label>{t("Seller")}</Label>
              <SellerPicker sellers={sellers} value={seller} onChange={setSeller} currentUserId={currentUserId} allowNew formFields />
            </div>
          )}
          {currencies.multi && (
            <div>
              <Label>{t("Price agreed in")}</Label>
              <Select name="currency" value={currency} onChange={(e) => setCurrencyChoice(e.target.value)} aria-label={t("Deal currency")}>
                {currencies.list.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {c === currencies.main ? ` (${t("main")})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>{t("Coordinator — who follows the patient up")}</Label>
            <input type="hidden" name="coordinator_id" value={coordinatorId} />
            <Select value={coordinatorId} onChange={(e) => setCoordinatorChoice(e.target.value)} aria-label={t("Coordinator")}>
              <option value="">{t("Nobody — the seller follows up")}</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === currentUserId ? ` ${t("(you)")}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="border-t border-slate-100" />

        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Visits")}</span>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            <span className="col-span-2 pb-2 text-sm font-semibold sm:col-span-1">{t("Visit 1")}</span>
            <div>
              <Label>{t("Date")}</Label>
              <DateInput name="visit1_date" aria-label={t("Visit 1 date")} defaultValue={src?.visit1_date ?? ""} />
            </div>
            <div>
              <Label>{t("Price ({sym})", { sym })}</Label>
              <Input type="number" min="0" step="0.01" name="visit1_expected" aria-label={t("Visit 1 price")} defaultValue={src?.visit1_expected ?? ""} />
            </div>

            <div className="col-span-2 pb-1 sm:col-span-1">
              <Toggle name="needs_visit2" on={needsVisit2} onChange={setNeedsVisit2}>
                {t("Visit 2")}
              </Toggle>
            </div>
            {needsVisit2 ? (
              <>
                <div>
                  <Label>{t("Recall")}</Label>
                  <Select name="visit2_recall_months" aria-label={t("Visit 2 recall")} defaultValue={String(recall)}>
                    {[...new Set([...RECALL_OPTIONS, recall])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        {m === 1 ? t("After 1 month") : t("After {n} months", { n: m })}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t("Price ({sym})", { sym })}</Label>
                  <Input type="number" min="0" step="0.01" name="visit2_expected" aria-label={t("Visit 2 price")} defaultValue={src?.visit2_expected ?? ""} />
                </div>
                {src?.visit2_date && <input type="hidden" name="visit2_date" value={src.visit2_date} />}
              </>
            ) : (
              <p className="col-span-2 pb-2 text-sm text-slate-500">{t("Single visit — you can add visit 2 later from the patient page.")}</p>
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
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending || checking}>
            {pending || checking ? t("Creating…") : `${t("Create patient")} →`}
          </Button>
        </div>
      </form>
    </div>
  );
}
