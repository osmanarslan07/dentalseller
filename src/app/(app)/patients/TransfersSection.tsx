"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { Transfer, TransferCompany, TransferKind, TransferStatus } from "@/types";
import { addTransfer, deleteTransfer, suggestTransfers, updateTransfer } from "./transfer-actions";

/** What the visit already knows — used to prefill new transfers and by "Suggest transfers". */
export interface VisitTravel {
  date: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  arrivalFlight: string | null;
  departureDate: string | null;
  departureTime: string | null;
  departureFlight: string | null;
  hotel: string | null;
  pax: number;
}

const KIND_LABELS: Record<TransferKind, string> = {
  arrival: "Arrival",
  departure: "Departure",
  local: "Local",
};
const KIND_TONES: Record<TransferKind, "green" | "amber" | "slate"> = {
  arrival: "green",
  departure: "amber",
  local: "slate",
};
const STATUS_LABELS: Record<TransferStatus, string> = {
  planned: "Planned",
  sent: "Sent to driver",
  done: "Done",
};
const STATUS_TONES: Record<TransferStatus, "slate" | "blue" | "green"> = {
  planned: "slate",
  sent: "blue",
  done: "green",
};

export function TransfersSection({
  patientId,
  visitKey,
  travel,
  transfers,
  companies,
  compact = false,
}: {
  patientId: string;
  /** "visit1" | "visit2" | an extra visit's id */
  visitKey: string;
  travel: VisitTravel;
  transfers: Transfer[];
  companies: TransferCompany[];
  /** Inside an extra visit's row — no card of its own. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSuggest = !!(travel.arrivalDate || travel.departureDate || travel.date);

  function handleSuggest() {
    startTransition(async () => {
      try {
        const { created } = await suggestTransfers(patientId, visitKey);
        showToast(
          created === 0
            ? "Nothing to add — this visit already has those transfers, or no flight/visit dates yet"
            : `${created} transfer${created === 1 ? "" : "s"} added — pick a driver for each`
        );
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to suggest transfers", "error");
      }
    });
  }

  function handleDelete(t: Transfer) {
    if (!confirm(`Delete the ${KIND_LABELS[t.kind].toLowerCase()} transfer ${t.from_place ?? ""} → ${t.to_place ?? ""}?`)) return;
    startTransition(async () => {
      try {
        await deleteTransfer(t.id);
        showToast("Transfer deleted");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete transfer", "error");
      }
    });
  }

  const body = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={compact ? "text-sm font-semibold text-slate-700" : "text-base font-semibold text-slate-900"}>
            Transfers {transfers.length > 0 && <span className="font-normal text-slate-400">({transfers.length})</span>}
          </h3>
          {!compact && (
            <p className="text-xs text-slate-500">
              Every car journey for this visit, with its driver. Arrival/departure count as arranged once a driver is
              picked.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canSuggest && (
            <Button type="button" size="sm" variant="secondary" onClick={handleSuggest} disabled={pending}>
              Suggest transfers
            </Button>
          )}
          {!adding && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
            >
              + Add transfer
            </Button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <TransferForm
            companies={companies}
            travel={travel}
            onCancel={() => setAdding(false)}
            onSave={async (formData) => {
              await addTransfer(patientId, visitKey, formData);
              showToast("Transfer added ✓");
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {transfers.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-sm text-slate-400">
          No transfers yet.{canSuggest ? " “Suggest transfers” fills in the usual ones from the flights and hotel." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                <TransferForm
                  transfer={t}
                  companies={companies}
                  travel={travel}
                  onCancel={() => setEditingId(null)}
                  onSave={async (formData) => {
                    await updateTransfer(t.id, formData);
                    showToast("Transfer saved ✓");
                    setEditingId(null);
                    router.refresh();
                  }}
                />
              </li>
            ) : (
              <TransferRow
                key={t.id}
                transfer={t}
                companies={companies}
                busy={pending}
                onEdit={() => {
                  setEditingId(t.id);
                  setAdding(false);
                }}
                onDelete={() => handleDelete(t)}
              />
            )
          )}
        </ul>
      )}
    </>
  );

  return compact ? <div className="mt-3 border-t border-slate-100 pt-3">{body}</div> : <Card className="p-5">{body}</Card>;
}

function TransferRow({
  transfer: t,
  companies,
  busy,
  onEdit,
  onDelete,
}: {
  transfer: Transfer;
  companies: TransferCompany[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const company = companies.find((c) => c.id === t.company_id);
  const driver = company?.drivers.find((d) => d.id === t.driver_id);
  const details = [
    `${t.pax} pax`,
    t.flight_no ? `✈ ${t.flight_no}` : null,
    t.cost != null ? formatCurrency(t.cost, "GBP") : null,
    t.notes,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <div className="w-24 shrink-0">
        <div className="font-medium text-slate-800">{t.transfer_date ? formatDate(t.transfer_date) : "No date"}</div>
        <div className="text-xs text-slate-500">{t.transfer_time || "time TBC"}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONES[t.kind]}>{KIND_LABELS[t.kind]}</Badge>
          <span className="font-medium text-slate-800">
            {t.from_place || "?"} → {t.to_place || "?"}
          </span>
          <Badge tone={STATUS_TONES[t.status]}>{STATUS_LABELS[t.status]}</Badge>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {driver ? (
            <>
              <span className="font-medium">{driver.name}</span>
              {driver.vehicle ? ` · ${driver.vehicle}` : ""}
              {company ? ` · ${company.is_internal ? "Clinic" : company.name}` : ""}
            </>
          ) : company ? (
            <span className="text-amber-700">{company.is_internal ? "Clinic" : company.name} · no driver yet</span>
          ) : (
            <span className="text-amber-700">No driver yet</span>
          )}
        </div>
        {details.length > 0 && <div className="mt-0.5 text-xs text-slate-400">{details.join(" · ")}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
        <button type="button" onClick={onEdit} className="text-teal-600 hover:underline">
          Edit
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className="text-slate-400 hover:text-red-600 hover:underline">
          Delete
        </button>
      </div>
    </li>
  );
}

function TransferForm({
  transfer,
  companies,
  travel,
  onCancel,
  onSave,
}: {
  transfer?: Transfer;
  companies: TransferCompany[];
  travel: VisitTravel;
  onCancel: () => void;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const hotel = travel.hotel || "Hotel";
  const [kind, setKind] = useState<TransferKind>(transfer?.kind ?? "arrival");
  // A new transfer starts from the arrival leg; switching type refills the route, date and
  // flight from the visit — unless the user has already typed their own.
  const prefill = (k: TransferKind) =>
    k === "arrival"
      ? { from: "Airport", to: hotel, date: travel.arrivalDate ?? "", time: travel.arrivalTime ?? "", flight: travel.arrivalFlight ?? "" }
      : k === "departure"
      ? { from: hotel, to: "Airport", date: travel.departureDate ?? "", time: "", flight: travel.departureFlight ?? "" }
      : { from: hotel, to: "Clinic", date: travel.date ?? "", time: "", flight: "" };
  const initial = transfer
    ? {
        from: transfer.from_place ?? "",
        to: transfer.to_place ?? "",
        date: transfer.transfer_date ?? "",
        time: transfer.transfer_time ?? "",
        flight: transfer.flight_no ?? "",
      }
    : prefill("arrival");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [flight, setFlight] = useState(initial.flight);
  const [touched, setTouched] = useState(!!transfer);

  const [companyId, setCompanyId] = useState(transfer?.company_id ?? "");
  const [driverId, setDriverId] = useState(transfer?.driver_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const company = companies.find((c) => c.id === companyId);
  const visibleCompanies = companies.filter((c) => c.is_active || c.id === transfer?.company_id);
  const visibleDrivers = (company?.drivers ?? []).filter((d) => d.is_active || d.id === transfer?.driver_id);

  function changeKind(k: TransferKind) {
    setKind(k);
    if (touched) return;
    const p = prefill(k);
    setFrom(p.from);
    setTo(p.to);
    setDate(p.date);
    setTime(p.time);
    setFlight(p.flight);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const placeOptions = [...new Set(["Airport", hotel, "Clinic"])];
  const listId = `places-${transfer?.id ?? "new"}`;

  return (
    <form
      onSubmit={handleSubmit}
      onChange={(e) => {
        if ((e.target as unknown as HTMLSelectElement).name !== "kind") setTouched(true);
      }}
      className="space-y-3"
    >
      <datalist id={listId}>
        {placeOptions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>Type</Label>
          <Select name="kind" value={kind} onChange={(e) => changeKind(e.target.value as TransferKind)}>
            <option value="arrival">Arrival (airport pickup)</option>
            <option value="departure">Departure (to airport)</option>
            <option value="local">Local (hotel ↔ clinic…)</option>
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" name="transfer_date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Pickup time (24h)</Label>
          <Input
            name="transfer_time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="14:30"
            inputMode="numeric"
            pattern="([01]\d|2[0-3]):[0-5]\d"
            title="Use 24-hour format, e.g. 14:30"
          />
        </div>
        <div>
          <Label>Pax</Label>
          <Input type="number" name="pax" min="1" max="50" step="1" defaultValue={transfer?.pax ?? travel.pax} />
        </div>
        <div className="col-span-2">
          <Label>From</Label>
          <Input name="from_place" value={from} onChange={(e) => setFrom(e.target.value)} list={listId} autoComplete="off" />
        </div>
        <div className="col-span-2">
          <Label>To</Label>
          <Input name="to_place" value={to} onChange={(e) => setTo(e.target.value)} list={listId} autoComplete="off" />
        </div>
        <div>
          <Label>Company</Label>
          <Select
            name="company_id"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setDriverId("");
            }}
          >
            <option value="">Not assigned</option>
            {visibleCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_internal ? `Clinic (internal)` : c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Driver</Label>
          <Select name="driver_id" value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={!company}>
            <option value="">{company ? "Pick a driver" : "Pick a company first"}</option>
            {visibleDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.vehicle ? ` · ${d.vehicle}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Cost (£)</Label>
          {company?.is_internal ? (
            <p className="py-2 text-sm text-slate-400">Free (clinic car)</p>
          ) : (
            <Input
              type="number"
              name="cost"
              min="0"
              step="0.01"
              defaultValue={transfer?.cost ?? ""}
              placeholder={company ? "0.00" : "—"}
              disabled={!company}
            />
          )}
        </div>
        <div>
          <Label>Flight no.</Label>
          <Input name="flight_no" value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="TK1234" />
        </div>
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={transfer?.status ?? "planned"}>
            <option value="planned">Planned</option>
            <option value="sent">Sent to driver</option>
            <option value="done">Done</option>
          </Select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <Label>Notes</Label>
          <Input name="notes" defaultValue={transfer?.notes ?? ""} placeholder="Wheelchair, extra luggage, meet at gate…" />
        </div>
      </div>

      {company && visibleDrivers.length === 0 && (
        <p className="text-xs text-amber-700">
          {company.is_internal ? "The clinic" : company.name} has no drivers yet — add them in Settings → Transfers.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : transfer ? "Save transfer" : "Add transfer"}
        </Button>
      </div>
    </form>
  );
}
