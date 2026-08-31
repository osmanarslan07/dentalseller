import { NextRequest, NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface VisitRow {
  name: string;
  visit1_date: string | null;
  visit1_arrival_date: string | null;
  visit1_arrival_time: string | null;
  visit1_arrival_flight_no: string | null;
  visit1_departure_date: string | null;
  visit1_departure_time: string | null;
  visit1_departure_flight_no: string | null;
  visit1_hotel_name: string | null;
  visit2_date: string | null;
  visit2_arrival_date: string | null;
  visit2_arrival_time: string | null;
  visit2_arrival_flight_no: string | null;
  visit2_departure_date: string | null;
  visit2_departure_time: string | null;
  visit2_departure_flight_no: string | null;
  visit2_hotel_name: string | null;
}

function flightLine(time: string | null, flightNo: string | null) {
  const parts = [time, flightNo].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date();
  const in1 = format(addDays(today, 1), "yyyy-MM-dd");
  const in7 = format(addDays(today, 7), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("patients")
    .select(
      "name, visit1_date, visit1_arrival_date, visit1_arrival_time, visit1_arrival_flight_no, visit1_departure_date, visit1_departure_time, visit1_departure_flight_no, visit1_hotel_name, visit2_date, visit2_arrival_date, visit2_arrival_time, visit2_arrival_flight_no, visit2_departure_date, visit2_departure_time, visit2_departure_flight_no, visit2_hotel_name"
    )
    .or(
      [
        `visit1_arrival_date.eq.${in1}`,
        `visit1_arrival_date.eq.${in7}`,
        `visit1_departure_date.eq.${in1}`,
        `visit1_date.eq.${in1}`,
        `visit1_date.eq.${in7}`,
        `visit2_arrival_date.eq.${in1}`,
        `visit2_arrival_date.eq.${in7}`,
        `visit2_departure_date.eq.${in1}`,
        `visit2_date.eq.${in1}`,
        `visit2_date.eq.${in7}`,
      ].join(",")
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lines: string[] = [];

  for (const p of (data ?? []) as VisitRow[]) {
    for (const [visit, arrivalDate, arrivalTime, arrivalFlight, departureDate, hotel, visitDate] of [
      [
        "Visit 1",
        p.visit1_arrival_date,
        p.visit1_arrival_time,
        p.visit1_arrival_flight_no,
        p.visit1_departure_date,
        p.visit1_hotel_name,
        p.visit1_date,
      ],
      [
        "Visit 2",
        p.visit2_arrival_date,
        p.visit2_arrival_time,
        p.visit2_arrival_flight_no,
        p.visit2_departure_date,
        p.visit2_hotel_name,
        p.visit2_date,
      ],
    ] as const) {
      if (arrivalDate === in7) {
        lines.push(`🗓 <b>${p.name}</b> (${visit}) arrives in 7 days${flightLine(arrivalTime, arrivalFlight)}`);
      }
      if (arrivalDate === in1) {
        lines.push(
          `🛬 <b>${p.name}</b> (${visit}) arrives <b>tomorrow</b>${flightLine(arrivalTime, arrivalFlight)}${hotel ? ` — ${hotel}` : ""}`
        );
      }
      if (departureDate === in1) {
        lines.push(`🛫 <b>${p.name}</b> (${visit}) departs <b>tomorrow</b>`);
      }

      // Patients without flight details: remind off the clinic visit date itself.
      if (!arrivalDate) {
        if (visitDate === in7) {
          lines.push(`📍 <b>${p.name}</b> (${visit}) in 7 days`);
        }
        if (visitDate === in1) {
          lines.push(`📍 <b>${p.name}</b> (${visit}) <b>tomorrow</b>`);
        }
      }
    }
  }

  const { data: extraVisits, error: extraError } = await supabase
    .from("patient_visits")
    .select("label, visit_date, status, patients(name)")
    .in("visit_date", [in1, in7])
    .eq("status", "upcoming");

  if (extraError) {
    return NextResponse.json({ error: extraError.message }, { status: 500 });
  }

  for (const v of (extraVisits ?? []) as unknown as {
    label: string;
    visit_date: string;
    patients: { name: string } | null;
  }[]) {
    const name = v.patients?.name ?? "Unknown";
    if (v.visit_date === in7) {
      lines.push(`🦷 <b>${name}</b> (${v.label}) in 7 days`);
    }
    if (v.visit_date === in1) {
      lines.push(`🦷 <b>${name}</b> (${v.label}) <b>tomorrow</b>`);
    }
  }

  if (lines.length === 0) {
    return NextResponse.json({ sent: false, reason: "No reminders today" });
  }

  await sendTelegramMessage(`<b>Upcoming visits</b>\n\n${lines.join("\n")}`);

  return NextResponse.json({ sent: true, count: lines.length });
}
