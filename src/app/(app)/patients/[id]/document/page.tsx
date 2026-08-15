import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatient, getSettings } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-slate-900 ${strong ? "text-lg font-bold" : "text-base font-semibold"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function formatTime(t: string | null): string {
  return t || "—";
}

function PlaneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12.5l16-7-6.5 16-2.5-7-7-2z" />
    </svg>
  );
}

function BedIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 18v-7a2 2 0 012-2h14a2 2 0 012 2v7" />
      <path d="M3 18v2M21 18v2M3 13h18" />
      <circle cx="7" cy="9.5" r="1.5" />
    </svg>
  );
}

function CoinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.5c0 2-5 .8-5 2.8 0 .8 1.1 1.5 2.5 1.5s2.5-.7 2.5-1.5" />
    </svg>
  );
}

export default async function PatientDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visit?: string }>;
}) {
  const { id } = await params;
  const { visit } = await searchParams;
  const visitNum: 1 | 2 = visit === "2" ? 2 : 1;

  const supabase = await createClient();
  const [patient, settings] = await Promise.all([getPatient(supabase, id), getSettings(supabase)]);

  if (!patient) notFound();

  const firstVisitPayment = patient.visit1_actual ?? patient.visit1_expected;
  const secondVisitPayment = patient.visit2_actual ?? patient.visit2_expected;
  const totalPayment = (firstVisitPayment ?? 0) + (secondVisitPayment ?? 0);

  const travel =
    visitNum === 1
      ? {
          arrivalDate: patient.visit1_arrival_date,
          arrivalTime: patient.visit1_arrival_time,
          arrivalFlightNo: patient.visit1_arrival_flight_no,
          departureDate: patient.visit1_departure_date,
          departureTime: patient.visit1_departure_time,
          departureFlightNo: patient.visit1_departure_flight_no,
          hotelName: patient.visit1_hotel_name,
          roomType: patient.visit1_room_type,
        }
      : {
          arrivalDate: patient.visit2_arrival_date,
          arrivalTime: patient.visit2_arrival_time,
          arrivalFlightNo: patient.visit2_arrival_flight_no,
          departureDate: patient.visit2_departure_date,
          departureTime: patient.visit2_departure_time,
          departureFlightNo: patient.visit2_departure_flight_no,
          hotelName: patient.visit2_hotel_name,
          roomType: patient.visit2_room_type,
        };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <Link
            href={`/patients/${id}/document?visit=1`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              visitNum === 1 ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Visit 1 document
          </Link>
          <Link
            href={`/patients/${id}/document?visit=2`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              visitNum === 2 ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Visit 2 document
          </Link>
        </div>
        <PrintButton />
      </div>

      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-900/5 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">Operations sheet</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{patient.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{patient.treatment || "—"}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
              Visit {visitNum}
            </span>
            <p className="text-xs text-slate-400">Confirmed {formatDate(patient.confirmation_date)}</p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="mb-4 flex items-center gap-2 text-slate-700">
            <PlaneIcon className="h-4 w-4" />
            <h2 className="text-sm font-bold uppercase tracking-wide">Travel</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Arrival</p>
              <div className="mt-3 space-y-3">
                <Field label="Date" value={formatDate(travel.arrivalDate)} />
                <Field label="Time" value={formatTime(travel.arrivalTime)} />
                <Field label="Flight number" value={travel.arrivalFlightNo ?? ""} strong />
              </div>
            </div>
            <div className="sm:border-l sm:border-slate-200 sm:pl-6">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Departure</p>
              <div className="mt-3 space-y-3">
                <Field label="Date" value={formatDate(travel.departureDate)} />
                <Field label="Time" value={formatTime(travel.departureTime)} />
                <Field label="Flight number" value={travel.departureFlightNo ?? ""} strong />
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-3 flex items-center gap-2 text-slate-700">
              <BedIcon className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-wide">Hotel</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hotel name" value={travel.hotelName ?? ""} />
              <Field label="Room type" value={travel.roomType ?? ""} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-teal-700">
            <CoinIcon className="h-4 w-4" />
            <h2 className="text-sm font-bold uppercase tracking-wide">Payment</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="First visit payment"
              value={firstVisitPayment != null ? formatCurrency(firstVisitPayment, settings.currency) : ""}
            />
            <Field
              label="Second visit payment"
              value={secondVisitPayment != null ? formatCurrency(secondVisitPayment, settings.currency) : ""}
            />
            <Field label="Total payment" value={formatCurrency(totalPayment, settings.currency)} strong />
          </div>
        </div>
      </div>
    </div>
  );
}
