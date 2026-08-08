"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { Patient } from "@/types";
import { createPatient, updatePatient } from "./actions";

export function PatientFormModal({
  open,
  onClose,
  patient,
}: {
  open: boolean;
  onClose: () => void;
  patient?: Patient | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!patient;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && patient) {
          await updatePatient(patient.id, formData);
        } else {
          await createPatient(formData);
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit patient" : "Add patient"}>
      <form action={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input name="name" required defaultValue={patient?.name} placeholder="Jane Smith" />
          </div>
          <div className="sm:col-span-2">
            <Label>Treatment</Label>
            <Input
              name="treatment"
              defaultValue={patient?.treatment ?? ""}
              placeholder="Full mouth veneers"
            />
          </div>
          <div>
            <Label>Confirmation date</Label>
            <Input type="date" name="confirmation_date" defaultValue={patient?.confirmation_date ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <Label>Komo reference</Label>
            <Input
              name="komo_reference"
              defaultValue={patient?.komo_reference ?? ""}
              placeholder="Komo lead link or ID"
            />
            {patient?.komo_reference && /^https?:\/\//i.test(patient.komo_reference) && (
              <a
                href={patient.komo_reference}
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
          date={patient?.visit1_date}
          expected={patient?.visit1_expected}
          actual={patient?.visit1_actual}
          status={patient?.visit1_status}
        />
        <VisitFields
          index={2}
          date={patient?.visit2_date}
          expected={patient?.visit2_expected}
          actual={patient?.visit2_actual}
          status={patient?.visit2_status}
        />

        <TravelFields
          index={1}
          arrivalDate={patient?.visit1_arrival_date}
          arrivalTime={patient?.visit1_arrival_time}
          arrivalFlightNo={patient?.visit1_arrival_flight_no}
          departureDate={patient?.visit1_departure_date}
          departureTime={patient?.visit1_departure_time}
          departureFlightNo={patient?.visit1_departure_flight_no}
          hotelName={patient?.visit1_hotel_name}
          roomType={patient?.visit1_room_type}
        />
        <TravelFields
          index={2}
          arrivalDate={patient?.visit2_arrival_date}
          arrivalTime={patient?.visit2_arrival_time}
          arrivalFlightNo={patient?.visit2_arrival_flight_no}
          departureDate={patient?.visit2_departure_date}
          departureTime={patient?.visit2_departure_time}
          departureFlightNo={patient?.visit2_departure_flight_no}
          hotelName={patient?.visit2_hotel_name}
          roomType={patient?.visit2_room_type}
        />

        <div>
          <Label>Notes</Label>
          <Textarea name="notes" rows={3} defaultValue={patient?.notes ?? ""} placeholder="Optional notes…" />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
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
          <Input name={`visit${index}_hotel_name`} defaultValue={hotelName ?? ""} />
        </div>
        <div>
          <Label>Room type</Label>
          <Input name={`visit${index}_room_type`} defaultValue={roomType ?? ""} placeholder="Double room" />
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
