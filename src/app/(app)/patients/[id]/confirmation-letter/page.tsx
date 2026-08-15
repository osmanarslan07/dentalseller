import { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatient, getSettings } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

/** Confirmation-letter dates read DD/MM/YYYY (or DD.MM.YYYY for flights) — matches the clinic's existing template. */
function formatDMY(dateStr: string | null, sep: string = "/"): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  const weekday = new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${d}${sep}${m}${sep}${y} (${weekday})`;
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-teal-700">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-1 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function ClipboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1M9 10h6M9 14h6M9 18h3" />
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

function PlaneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12.5l16-7-6.5 16-2.5-7-7-2z" />
    </svg>
  );
}

export default async function ConfirmationLetterPage({
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

  const clinic = {
    name: settings.clinic_name,
    shortName: settings.clinic_short_name,
    address: settings.clinic_address,
    phone: settings.clinic_phone,
    email: settings.clinic_email,
    logoUrl: settings.clinic_logo_url ?? null,
  };

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

  const firstAppointment = visitNum === 1 ? patient.visit1_date : patient.visit2_date;
  const todayLabel = formatDMY(new Date().toISOString().slice(0, 10));

  const treatmentItems = (patient.letter_treatment_items || patient.treatment || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <Link
            href={`/patients/${id}/confirmation-letter?visit=1`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              visitNum === 1 ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Visit 1 flight
          </Link>
          <Link
            href={`/patients/${id}/confirmation-letter?visit=2`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              visitNum === 2 ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Visit 2 flight
          </Link>
        </div>
        <PrintButton />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <div className="flex flex-col items-start gap-4 border-b-4 border-slate-900 pb-4 sm:flex-row sm:justify-between sm:gap-6 print:flex-row print:justify-between print:gap-6">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt={clinic.shortName} className="h-24 w-auto object-contain" />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center text-sm font-medium text-slate-400">
              No Logo
            </div>
          )}
          <div className="text-xs leading-relaxed text-slate-600 sm:text-right print:text-right">
            <p>{clinic.address}</p>
            <p className="font-semibold text-slate-900">{clinic.phone}</p>
            <p>
              EMAIL: <span className="font-medium text-teal-700">{clinic.email}</span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm font-bold text-slate-900">{todayLabel}</p>

        <div className="mt-4 grid grid-cols-1 gap-10 print:grid-cols-[1.6fr_1fr] sm:grid-cols-[1.6fr_1fr]">
          <div>
            <h1 className="border-b border-slate-900 pb-1 text-xl font-bold text-slate-900">Thank you!</h1>
            <p className="mt-4 text-sm text-slate-700">Dear {patient.name},</p>
            <p className="mt-3 text-sm font-bold text-slate-900">
              It&apos;s our pleasure to welcome you to the {clinic.shortName} and Antalya!
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              We have included all the key information you may need once you arrive. Our team has taken
              care of everything for you. On the right, you will find your flight number, hotel
              confirmation, and a brief overview of your treatment at our clinic.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Please verify that all your personal information is correct. If there are any discrepancies,
              please contact us to correct them.
            </p>
            <p className="mt-4 text-sm text-slate-700">
              Thank you,
              <br />
              {clinic.name}
            </p>

            <div className="mt-8">
              <h2 className="border-b border-slate-900 pb-1 text-lg font-bold text-slate-900">
                Payment Information
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                <li className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-1.5">
                  <span>First Visit Payment:</span>
                  <span className="font-bold tabular-nums">
                    {firstVisitPayment != null ? formatCurrency(firstVisitPayment, settings.currency) : "—"}
                  </span>
                </li>
                <li className="flex items-baseline justify-between gap-4">
                  <span>Second Visit Payment:</span>
                  <span className="font-bold tabular-nums">
                    {secondVisitPayment != null ? formatCurrency(secondVisitPayment, settings.currency) : "—"}
                  </span>
                </li>
              </ul>
              <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-teal-600 px-4 py-3 text-white">
                <span className="text-sm font-semibold">Total Amount To Be Paid</span>
                <span className="text-xl font-bold tabular-nums">{formatCurrency(totalPayment, settings.currency)}</span>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Our package prices are quoted for cash payments in British Pounds (£). If you prefer to pay
                via credit card, debit card, or bank transfer, please be aware that a 3% bank commission fee
                will be applied. We kindly ask that you have your preferred payment method arranged before
                your treatment begins.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Section title="Treatment" icon={<ClipboardIcon className="h-3.5 w-3.5" />}>
              {treatmentItems.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {treatmentItems.map((item, i) => (
                    <li key={i} className="font-semibold">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">—</p>
              )}
              <p className="border-t border-teal-100 pt-2 font-semibold">
                First Appointment: <span className="font-normal">{formatDMY(firstAppointment)}</span>
              </p>
            </Section>

            <Section title="Hotel" icon={<BedIcon className="h-3.5 w-3.5" />}>
              <p className="font-semibold">{travel.hotelName || "—"}</p>
              {travel.roomType && <p>{travel.roomType}</p>}
              <p className="pt-2">
                Check In: <span className="font-semibold">{formatDMY(travel.arrivalDate)}</span>
              </p>
              <p>
                Check Out: <span className="font-semibold">{formatDMY(travel.departureDate)}</span>
              </p>
            </Section>

            <Section title="Flights" icon={<PlaneIcon className="h-3.5 w-3.5" />}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Arrival</p>
              <p className="font-semibold underline">{travel.arrivalFlightNo || "—"}</p>
              <p className="text-xs text-slate-500">
                {formatDMY(travel.arrivalDate, ".")} {travel.arrivalTime || ""}
              </p>
              <p className="border-t border-teal-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                Departure
              </p>
              <p className="font-semibold underline">{travel.departureFlightNo || "—"}</p>
              <p className="text-xs text-slate-500">
                {formatDMY(travel.departureDate, ".")} {travel.departureTime || ""}
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
