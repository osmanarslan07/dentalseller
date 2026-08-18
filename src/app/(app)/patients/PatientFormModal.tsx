"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Patient } from "@/types";
import { createPatient, updatePatient, sendPatientTelegramMessage } from "./actions";

export function PatientFormModal({
  open,
  onClose,
  patient,
  duplicateFrom,
  hotelOptions = [],
  roomTypeOptions = [],
}: {
  open: boolean;
  onClose: () => void;
  patient?: Patient | null;
  /** Prefill a new (non-edit) patient from an existing one — for group bookings sharing a flight/hotel. */
  duplicateFrom?: Patient | null;
  /** Previously-used hotel names / room types, offered as autocomplete suggestions. */
  hotelOptions?: string[];
  roomTypeOptions?: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [telegramPending, setTelegramPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!patient;

  // Prefill source: the record being edited, or the record being duplicated from. Duplicating clears
  // fields that shouldn't carry over to a different person (name, CRM ref, confirmation, payments made).
  const initial: Patient | (Partial<Patient> & { needs_visit2: boolean }) | null | undefined = patient
    ? patient
    : duplicateFrom
    ? {
        ...duplicateFrom,
        name: "",
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
  const { showToast } = useToast();

  useEffect(() => {
    if (open) setIsDirty(false);
  }, [open, patient?.id, duplicateFrom?.id]);

  useEffect(() => {
    if (open) setNeedsVisit2(initial ? initial.needs_visit2 : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient?.id, duplicateFrom?.id]);

  function handleRequestClose() {
    if (isDirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  async function handleSendTelegram() {
    if (!patient) return;
    setTelegramPending(true);
    try {
      await sendPatientTelegramMessage(patient.id);
      showToast("Sent to Telegram ✓");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to send to Telegram");
    } finally {
      setTelegramPending(false);
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && patient) {
          await updatePatient(patient.id, formData);
          showToast("Patient saved ✓");
        } else {
          await createPatient(formData);
          showToast("Patient added ✓");
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleRequestClose}
      title={isEdit ? "Edit patient" : duplicateFrom ? `Duplicate ${duplicateFrom.name}` : "Add patient"}
    >
      <form action={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-5">
        {duplicateFrom && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
            Prefilled from {duplicateFrom.name}&apos;s travel, hotel and treatment. Name, Komo reference,
            confirmation date and payments were left blank for you to fill in.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input name="name" required defaultValue={initial?.name} placeholder="Jane Smith" />
          </div>
          <div className="sm:col-span-2">
            <Label>Treatment</Label>
            <Input
              name="treatment"
              defaultValue={initial?.treatment ?? ""}
              placeholder="Full mouth veneers"
            />
            <p className="mt-1 text-xs text-slate-400">
              Short label — shown on the dashboard, calendar and upcoming visits.
            </p>
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
              Comma-separated — each item becomes a bullet on the confirmation letter. Leave blank to fall
              back to the Treatment field above.
            </p>
          </div>
          <div>
            <Label>Confirmation date</Label>
            <Input type="date" name="confirmation_date" defaultValue={initial?.confirmation_date ?? ""} />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="needs_visit2"
                checked={needsVisit2}
                onChange={(e) => setNeedsVisit2(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
              />
              Needs a second visit
            </label>
          </div>
          <div className="sm:col-span-2">
            <Label>Komo reference</Label>
            <Input
              name="komo_reference"
              defaultValue={initial?.komo_reference ?? ""}
              placeholder="Komo lead link or ID"
            />
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
        </div>

        <VisitFields
          index={1}
          date={initial?.visit1_date}
          expected={initial?.visit1_expected}
          actual={initial?.visit1_actual}
          status={initial?.visit1_status}
        />
        {needsVisit2 && (
          <VisitFields
            index={2}
            date={initial?.visit2_date}
            expected={initial?.visit2_expected}
            actual={initial?.visit2_actual}
            status={initial?.visit2_status}
          />
        )}

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
          hotelOptions={hotelOptions}
          roomTypeOptions={roomTypeOptions}
        />
        {needsVisit2 && (
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
            hotelOptions={hotelOptions}
            roomTypeOptions={roomTypeOptions}
          />
        )}

        <div>
          <Label>Notes</Label>
          <Textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Optional notes…" />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          {isEdit && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendTelegram}
              disabled={telegramPending}
              className="mr-auto"
            >
              {telegramPending ? "Sending…" : "Send to Telegram"}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleRequestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
          </Button>
        </div>
      </form>
    </Modal>
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
  hotelOptions = [],
  roomTypeOptions = [],
}: {
  index: 1 | 2;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  arrivalFlightNo?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  departureFlightNo?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
  hotelOptions?: string[];
  roomTypeOptions?: string[];
}) {
  return (
    <fieldset className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">Visit {index} travel &amp; hotel</legend>
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
      </div>
    </fieldset>
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

function VisitFields({
  index,
  date,
  expected,
  actual,
  status,
}: {
  index: 1 | 2;
  date?: string | null;
  expected?: number | null;
  actual?: number | null;
  status?: "upcoming" | "completed";
}) {
  return (
    <fieldset className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">Visit {index}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Label>Date</Label>
          <Input type="date" name={`visit${index}_date`} defaultValue={date ?? ""} />
        </div>
        <div>
          <Label>Expected (£)</Label>
          <Input type="number" step="0.01" min="0" name={`visit${index}_expected`} defaultValue={expected ?? ""} />
        </div>
        <div>
          <Label>Actual (£)</Label>
          <Input type="number" step="0.01" min="0" name={`visit${index}_actual`} defaultValue={actual ?? ""} />
        </div>
        <div>
          <Label>Status</Label>
          <Select name={`visit${index}_status`} defaultValue={status ?? "upcoming"}>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
