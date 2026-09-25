"use client";

import { DateInput } from "@/components/DateInput";
import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { DriverMessagesMode, Transfer, TransferCompany, TransferDefaults, TransferKind, TransferStatus } from "@/types";
import { departurePickup, LOCAL_PICKUP_TIME } from "@/lib/transfer-times";
import { driverMessage, isWhatsAppable } from "@/lib/transfer-message";
import { DriverMessagesOffHint, FallbackLink, sendLabel, useDriverMessages, WhatsAppDelivery } from "@/components/driver-messages";
import { addTransfer, deleteTransfer, markTransferSent, setTransferStatus, suggestTransfers, updateTransfer } from "../transfer-actions";
import { RowMenu } from "./Menu";
import { moneyIn, Pill, PillTone, Section, Segmented } from "./bits";
import { useCurrencies } from "@/components/currency";
import { currencySymbol } from "@/lib/money";
import { shortDate, transfersWithoutDriver } from "./visits";
import { useCan } from "@/components/permissions";
import { useLocale, useT } from "@/i18n/client";

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

const KIND_LABELS: Record<TransferKind, string> = { arrival: "Arrival", departure: "Departure", local: "Local" };
const KIND_TONES: Record<TransferKind, PillTone> = { arrival: "green", departure: "orange", local: "slate" };
const STATUS_LABELS: Record<TransferStatus, string> = { planned: "Not sent", sent: "Sent", done: "Done" };
const STATUS_TONES: Record<TransferStatus, PillTone> = { planned: "slate", sent: "blue", done: "green" };

const GRID = "lg:grid lg:grid-cols-[130px_100px_minmax(0,1fr)_210px_120px_170px] lg:items-center lg:gap-3";

function sentAt(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function TransfersCard({
  patientId,
  patientName,
  patientPhone,
  visitKey,
  travel,
  transfers,
  companies,
  defaults,
  deductCosts,
  driverMessages,
}: {
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  /** "visit1" | "visit2" | an extra visit's id */
  visitKey: string;
  travel: VisitTravel;
  transfers: Transfer[];
  companies: TransferCompany[];
  /** Settings → Transfers defaults — a new transfer starts with these. */
  defaults: TransferDefaults;
  /** Settings → System: external transfer costs come off before commission. */
  deductCosts: boolean;
  /** Settings → Transfers → Driver messages. */
  driverMessages: DriverMessagesMode;
}) {
  const router = useRouter();
  const tx = useT();
  const locale = useLocale();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const messages = useDriverMessages(driverMessages);
  const canSetUpDriverMessages = useCan("messaging.manage");
  const canBook = useCan("transfers.manage");

  const canSuggest = !!(travel.arrivalDate || travel.departureDate || travel.date);
  const noDriver = transfersWithoutDriver(transfers).length;
  const sorted = [...transfers].sort((a, b) =>
    `${a.transfer_date ?? "9999"} ${a.transfer_time ?? ""}`.localeCompare(`${b.transfer_date ?? "9999"} ${b.transfer_time ?? ""}`)
  );

  function run(action: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      try {
        await action();
        if (done) showToast(done);
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : tx("Something went wrong"), "error");
      }
    });
  }

  function handleSuggest() {
    startTransition(async () => {
      try {
        const { created } = await suggestTransfers(patientId, visitKey);
        showToast(
          created === 0
            ? tx("Nothing to add — this visit already has those transfers, or no flight/visit dates yet")
            : created === 1
              ? tx("1 transfer added — check the driver")
              : tx("{n} transfers added — check the drivers", { n: created })
        );
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : tx("Failed to suggest transfers"), "error");
      }
    });
  }

  function driverSend(t: Transfer) {
    const driver = companies.find((c) => c.id === t.company_id)?.drivers.find((d) => d.id === t.driver_id);
    if (!driver?.phone) return null;
    return {
      key: t.id,
      transferIds: [t.id],
      driverName: driver.name,
      driverPhone: driver.phone,
      text: driverMessage(t, patientName, patientPhone),
      markSent: () => markTransferSent(t.id),
    };
  }

  function handleDelete(t: Transfer) {
    if (!confirm(tx("Delete the {kind} transfer {route}?", { kind: tx(KIND_LABELS[t.kind]).toLocaleLowerCase(locale), route: `${t.from_place ?? ""} → ${t.to_place ?? ""}` }))) return;
    run(() => deleteTransfer(t.id), tx("Transfer deleted"));
  }

  const form = (t?: Transfer) => (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <TransferForm
        transfer={t}
        companies={companies}
        travel={travel}
        defaults={defaults}
        deductCosts={deductCosts}
        onCancel={() => setEditing(null)}
        onSave={async (fd) => {
          if (t) await updateTransfer(t.id, fd);
          else await addTransfer(patientId, visitKey, fd);
          showToast(t ? tx("Transfer saved ✓") : tx("Transfer added ✓"));
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );

  return (
    <Section
      title={tx("Transfers")}
      aside={
        <>
          {transfers.length > 0 && (
            <span className="text-xs text-slate-500">
              {transfers.length === 1 ? tx("1 journey") : tx("{n} journeys", { n: transfers.length })} · {tx("{n} pax", { n: travel.pax })}
            </span>
          )}
          {noDriver > 0 && <Pill tone="amber">{tx("{n} without driver", { n: noDriver })}</Pill>}
        </>
      }
      actions={
        canBook && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleSuggest}
            disabled={pending || !canSuggest}
            title={canSuggest ? tx("Adds arrival, clinic and departure from the flights and hotel") : tx("Add the flights or a visit date first")}
          >
            {tx("Suggest transfers")}
          </Button>
          <Button type="button" size="sm" onClick={() => setEditing("new")} disabled={editing === "new"}>
            + {tx("Add transfer")}
          </Button>
        </>
        )
      }
    >
      {editing === "new" && form()}

      {transfers.length === 0 && editing !== "new" ? (
        <p className="rounded-xl border-[1.5px] border-dashed border-slate-300 p-4 text-center text-[13px] text-slate-500">
          {tx("No transfers yet.")}{" "}
          {canSuggest
            ? tx("“Suggest transfers” fills in arrival, clinic and departure with your default drivers.")
            : tx("Add the flights and hotel above, then “Suggest transfers” fills in arrival, clinic and departure.")}
        </p>
      ) : (
        transfers.length > 0 && (
          // No overflow-hidden here: it would clip the ⋯ menu of the last rows. The first and last
          // rows round their own corners instead.
          <div className="flex flex-col gap-2 lg:gap-0 lg:rounded-xl lg:border lg:border-slate-100 lg:[&>*:first-child]:rounded-t-xl lg:[&>*:last-child]:rounded-b-xl">
            <div className={`hidden bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 ${GRID}`}>
              <span>{tx("Pickup")}</span>
              <span>{tx("Type")}</span>
              <span>{tx("Route")}</span>
              <span>{tx("Driver")}</span>
              <span>{tx("Status")}</span>
              <span className="text-right">{tx("Actions")}</span>
            </div>
            {sorted.map((t) =>
              editing === t.id ? (
                <div key={t.id} className="lg:border-t lg:border-slate-100 lg:p-2">
                  {form(t)}
                </div>
              ) : (
                <TransferRow
                  key={t.id}
                  transfer={t}
                  companies={companies}
                  busy={pending}
                  messages={messages}
                  onSend={() => {
                    const s = driverSend(t);
                    if (s) messages.send(s);
                  }}
                  onFallbackUsed={() => {
                    const s = driverSend(t);
                    if (s) messages.sentViaFallback(s);
                  }}
                  onCopy={() => messages.copy(driverMessage(t, patientName, patientPhone))}
                  onEdit={() => setEditing(t.id)}
                  onStatus={(s) => run(() => setTransferStatus(t.id, s), s === "done" ? tx("Marked as done ✓") : tx("Marked as not sent"))}
                  onDelete={() => handleDelete(t)}
                  readOnly={!canBook}
                />
              )
            )}
          </div>
        )
      )}
      {driverMessages === "off" ? (
        canSetUpDriverMessages && <DriverMessagesOffHint />
      ) : (
        <p className="text-xs text-slate-500">
          {tx("Arrival and departure count as arranged once a driver is picked.")}{" "}
          {driverMessages === "api"
            ? tx("Driver messages are sent in Turkish from the clinic’s WhatsApp Business number.")
            : tx("Driver messages open in WhatsApp in Turkish, ready to send.")}
        </p>
      )}
    </Section>
  );
}

function TransferRow({
  transfer: t,
  companies,
  busy,
  messages,
  onSend,
  onFallbackUsed,
  onCopy,
  onEdit,
  onStatus,
  onDelete,
  readOnly,
}: {
  /** Can see transfers but not book them: no actions. */
  readOnly: boolean;
  transfer: Transfer;
  companies: TransferCompany[];
  busy: boolean;
  messages: ReturnType<typeof useDriverMessages>;
  onSend: () => void;
  onFallbackUsed: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onStatus: (s: TransferStatus) => void;
  onDelete: () => void;
}) {
  const tx = useT();
  const locale = useLocale();
  const company = companies.find((c) => c.id === t.company_id);
  const driver = company?.drivers.find((d) => d.id === t.driver_id);
  const companyName = company ? (company.is_internal ? tx("Clinic car") : company.name) : null;
  // a transfer's cost is the clinic's own, in its main currency
  const main = useCurrencies().main;
  const meta = [t.flight_no ? `✈ ${t.flight_no}` : null, tx("{n} pax", { n: t.pax }), t.cost != null ? tx("cost {amount}", { amount: moneyIn(main)(t.cost) }) : null, t.notes]
    .filter(Boolean)
    .join(" · ");
  const missingDriver = !driver && t.status !== "done";

  let action: ReactNode = null;
  if (readOnly) {
    action = null;
  } else if (missingDriver) {
    action = (
      <button type="button" onClick={onEdit} className="rounded-lg bg-amber-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-amber-800">
        {tx("Assign driver")}
      </button>
    );
  } else if (driver && t.status !== "done" && messages.mode !== "off") {
    const fallbackUrl = messages.fallbackUrl(t.id);
    action = fallbackUrl ? (
      <FallbackLink url={fallbackUrl} onUse={onFallbackUsed} />
    ) : (
      <button
        type="button"
        onClick={onSend}
        disabled={!isWhatsAppable(driver.phone) || messages.busyKey === t.id}
        title={
          !driver.phone
            ? tx("{name} has no phone number — add it in Settings → Transfers", { name: driver.name })
            : messages.mode === "api"
            ? tx("Send the transfer details to {name} from the clinic's WhatsApp number", { name: driver.name })
            : tx("Open WhatsApp with the transfer details for {name}", { name: driver.name })
        }
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {messages.busyKey === t.id ? tx("Sending…") : tx(sendLabel(messages.mode, t.status !== "planned"))}
      </button>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-sm lg:rounded-none lg:border-0 lg:border-t lg:border-slate-100 ${GRID} ${
        missingDriver ? "border-amber-200 bg-amber-50/60" : "border-slate-100"
      } ${t.status === "done" ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 lg:block">
        <div className="flex items-baseline gap-2 lg:flex-col lg:gap-0">
          <span className="font-semibold">{t.transfer_date ? shortDate(t.transfer_date, false, locale) : tx("No date")}</span>
          <span className="font-mono text-[15px] font-semibold">{t.transfer_time || tx("time TBC")}</span>
        </div>
        <span className="lg:hidden">
          <Pill tone={KIND_TONES[t.kind]}>{tx(KIND_LABELS[t.kind])}</Pill>
        </span>
      </div>
      <div className="hidden lg:block">
        <Pill tone={KIND_TONES[t.kind]}>{tx(KIND_LABELS[t.kind])}</Pill>
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold">
          {t.from_place || "?"} → {t.to_place || "?"}
        </span>
        <span className="text-xs text-slate-500">{meta}</span>
      </div>
      <div className="flex min-w-0 flex-col">
        {driver ? (
          <>
            <span className="font-semibold">{driver.name}</span>
            <span className="truncate text-xs text-slate-500">{[companyName, driver.vehicle].filter(Boolean).join(" · ")}</span>
          </>
        ) : t.status === "done" ? (
          <span className="text-slate-500">{companyName ?? "—"}</span>
        ) : (
          <>
            <span className="font-bold text-amber-700">{tx("No driver yet")}</span>
            {companyName && <span className="text-xs text-slate-500">{companyName}</span>}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
        <Pill tone={STATUS_TONES[t.status]}>{tx(STATUS_LABELS[t.status])}</Pill>
        {t.status === "sent" && t.sent_at && <span className="text-xs text-slate-500">{sentAt(t.sent_at, locale)}</span>}
        <WhatsAppDelivery transfer={t} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {action}
        {!readOnly && (
        <RowMenu
          label={tx("Transfer actions")}
          items={[
            { label: tx("Edit"), onSelect: onEdit },
            { label: tx("Copy driver message"), hint: tx("to paste anywhere"), onSelect: onCopy },
            t.status === "done"
              ? { label: tx("Mark as not done"), onSelect: () => onStatus(driver && t.sent_at ? "sent" : "planned"), disabled: busy }
              : { label: tx("Mark as done"), hint: tx("the journey has happened"), onSelect: () => onStatus("done"), disabled: busy },
            { label: tx("Delete transfer…"), danger: true, divider: true, onSelect: onDelete, disabled: busy },
          ]}
        />
        )}
      </div>
    </div>
  );
}

function TransferForm({
  transfer,
  companies,
  travel,
  defaults,
  deductCosts,
  onCancel,
  onSave,
}: {
  defaults: TransferDefaults;
  deductCosts: boolean;
  transfer?: Transfer;
  companies: TransferCompany[];
  travel: VisitTravel;
  onCancel: () => void;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const { main: mainCurrency } = useCurrencies();
  const tx = useT();
  const locale = useLocale();
  const hotel = travel.hotel || "Hotel";
  const [kind, setKind] = useState<TransferKind>(transfer?.kind ?? "arrival");
  const [status, setStatus] = useState<TransferStatus>(transfer?.status ?? "planned");
  // A new transfer starts from the arrival leg; switching type refills the route, date and
  // flight from the visit — unless the user has already typed their own.
  // Same rules as "Suggest transfers": landing time, 3h before departure, 10:00 local.
  const airportDefault = { company: defaults.airportCompanyId ?? "", driver: defaults.airportCompanyId ? defaults.airportDriverId ?? "" : "" };
  const localDefault = { company: defaults.localCompanyId ?? "", driver: defaults.localCompanyId ? defaults.localDriverId ?? "" : "" };
  const prefill = (k: TransferKind) => {
    if (k === "arrival") {
      return { from: "Airport", to: hotel, date: travel.arrivalDate ?? "", time: travel.arrivalTime ?? "", flight: travel.arrivalFlight ?? "", ...airportDefault };
    }
    if (k === "departure") {
      const pickup = departurePickup(travel.departureDate, travel.departureTime);
      return { from: hotel, to: "Airport", date: pickup.date ?? "", time: pickup.time ?? "", flight: travel.departureFlight ?? "", ...airportDefault };
    }
    return { from: hotel, to: "Clinic", date: travel.date ?? "", time: LOCAL_PICKUP_TIME, flight: "", ...localDefault };
  };
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

  const [companyId, setCompanyId] = useState(transfer ? transfer.company_id ?? "" : airportDefault.company);
  const [driverId, setDriverId] = useState(transfer ? transfer.driver_id ?? "" : airportDefault.driver);
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
    setCompanyId(p.company);
    setDriverId(p.driver);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : tx("Something went wrong"));
      }
    });
  }

  const placeOptions = [...new Set(["Airport", hotel, "Clinic"])];
  const listId = `places-${transfer?.id ?? "new"}`;

  return (
    <form onSubmit={handleSubmit} onChange={() => setTouched(true)} className="space-y-3">
      <datalist id={listId}>
        {placeOptions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">
          {transfer ? tx("Editing the {kind} transfer", { kind: tx(KIND_LABELS[transfer.kind]).toLocaleLowerCase(locale) }) : tx("New transfer")}
        </p>
        <Segmented
          name="kind"
          size="sm"
          value={kind}
          onChange={changeKind}
          options={[
            { value: "arrival", label: tx("Arrival") },
            { value: "local", label: tx("Local") },
            { value: "departure", label: tx("Departure") },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>{tx("Date")}</Label>
          <DateInput name="transfer_date" value={date} onChange={setDate} />
        </div>
        <div>
          <Label>{tx("Pickup (24h)")}</Label>
          <Input
            name="transfer_time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="14:30"
            inputMode="numeric"
            pattern="([01]\d|2[0-3]):[0-5]\d"
            title={tx("Use 24-hour format, e.g. 14:30")}
          />
        </div>
        <div>
          <Label>{tx("Flight no.")}</Label>
          <Input name="flight_no" value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="TK1234" />
        </div>
        <div>
          <Label>{tx("Pax")}</Label>
          <Input type="number" name="pax" min="1" max="50" step="1" defaultValue={transfer?.pax ?? travel.pax} />
        </div>
        <div className="col-span-2">
          <Label>{tx("From")}</Label>
          <Input name="from_place" value={from} onChange={(e) => setFrom(e.target.value)} list={listId} autoComplete="off" />
        </div>
        <div className="col-span-2">
          <Label>{tx("To")}</Label>
          <Input name="to_place" value={to} onChange={(e) => setTo(e.target.value)} list={listId} autoComplete="off" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>{tx("Company")}</Label>
          <Select
            name="company_id"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setDriverId("");
            }}
          >
            <option value="">{tx("Not assigned")}</option>
            {visibleCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_internal ? tx("Clinic (internal)") : c.name}
                {c.id === defaults.airportCompanyId || c.id === defaults.localCompanyId ? ` · ${tx("default")}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>{tx("Driver")}</Label>
          <Select name="driver_id" value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={!company}>
            <option value="">{company ? tx("Pick a driver") : tx("Pick a company first")}</option>
            {visibleDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.vehicle ? ` · ${d.vehicle}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{tx("Cost ({sym})", { sym: currencySymbol(mainCurrency) })}</Label>
          {company?.is_internal ? (
            <p className="py-2 text-sm text-slate-500">{tx("Free — clinic car")}</p>
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
          <Label>{tx("Status")}</Label>
          <Segmented
            name="status"
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "planned", label: tx("Not sent") },
              { value: "sent", label: tx("Sent") },
              { value: "done", label: tx("Done") },
            ]}
          />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <Label>{tx("Notes")}</Label>
          <Input name="notes" defaultValue={transfer?.notes ?? ""} placeholder={tx("Wheelchair, extra luggage, meet at reception…")} />
        </div>
      </div>

      {deductCosts && company && !company.is_internal && (
        <p className="text-xs text-slate-500">
          {tx("The cost is deducted before commission.")}
          {date && date.slice(0, 7) < new Date().toISOString().slice(0, 7) && (
            <span className="text-amber-700"> ⚠ {tx("Past month — changes that month's commission.")}</span>
          )}
        </p>
      )}
      {company && visibleDrivers.length === 0 && (
        <p className="text-xs text-amber-700">
          {tx("{name} has no drivers yet — add them in Settings → Transfers.", { name: company.is_internal ? tx("The clinic") : company.name })}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {tx("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tx("Saving…") : transfer ? tx("Save transfer") : tx("Add transfer")}
        </Button>
      </div>
    </form>
  );
}
