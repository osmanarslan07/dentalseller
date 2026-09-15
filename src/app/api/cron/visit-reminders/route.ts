import { NextRequest, NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFallbackChatId, sendTelegramMessageToMany } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface VisitRow {
  name: string;
  responsible_seller_id: string;
  visit1_date: string | null;
  visit1_arrival_date: string | null;
  visit1_arrival_time: string | null;
  visit1_arrival_flight_no: string | null;
  visit1_departure_date: string | null;
  visit1_departure_time: string | null;
  visit1_departure_flight_no: string | null;
  visit1_hotel_name: string | null;
  visit1_arrival_transfer_arranged: boolean;
  visit1_departure_transfer_arranged: boolean;
  visit1_hotel_arranged: boolean;
  visit2_date: string | null;
  visit2_arrival_date: string | null;
  visit2_arrival_time: string | null;
  visit2_arrival_flight_no: string | null;
  visit2_departure_date: string | null;
  visit2_departure_time: string | null;
  visit2_departure_flight_no: string | null;
  visit2_hotel_name: string | null;
  visit2_arrival_transfer_arranged: boolean;
  visit2_departure_transfer_arranged: boolean;
  visit2_hotel_arranged: boolean;
}

function flightLine(time: string | null, flightNo: string | null) {
  const parts = [time, flightNo].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Only meaningful once we know a date's actually set — a patient with no flight info yet,
 * or who arranges their own transfer/hotel, shouldn't get nagged. */
function missingWarning(items: { label: string; ok: boolean }[]): string {
  const missing = items.filter((i) => !i.ok).map((i) => i.label);
  return missing.length ? ` ⚠️ ${missing.join(" & ")} not arranged` : "";
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
      "name, responsible_seller_id, visit1_date, visit1_arrival_date, visit1_arrival_time, visit1_arrival_flight_no, visit1_departure_date, visit1_departure_time, visit1_departure_flight_no, visit1_hotel_name, visit1_arrival_transfer_arranged, visit1_departure_transfer_arranged, visit1_hotel_arranged, visit2_date, visit2_arrival_date, visit2_arrival_time, visit2_arrival_flight_no, visit2_departure_date, visit2_departure_time, visit2_departure_flight_no, visit2_hotel_name, visit2_arrival_transfer_arranged, visit2_departure_transfer_arranged, visit2_hotel_arranged"
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

  // Grouped per responsible seller — each seller gets only their own patients' reminders.
  const linesBySeller = new Map<string, string[]>();
  const addLine = (sellerId: string, line: string) => {
    const list = linesBySeller.get(sellerId) ?? [];
    list.push(line);
    linesBySeller.set(sellerId, list);
  };

  for (const p of (data ?? []) as VisitRow[]) {
    for (const [
      visit,
      arrivalDate,
      arrivalTime,
      arrivalFlight,
      departureDate,
      hotel,
      visitDate,
      arrivalTransferArranged,
      departureTransferArranged,
      hotelArranged,
    ] of [
      [
        "Visit 1",
        p.visit1_arrival_date,
        p.visit1_arrival_time,
        p.visit1_arrival_flight_no,
        p.visit1_departure_date,
        p.visit1_hotel_name,
        p.visit1_date,
        p.visit1_arrival_transfer_arranged,
        p.visit1_departure_transfer_arranged,
        p.visit1_hotel_arranged,
      ],
      [
        "Visit 2",
        p.visit2_arrival_date,
        p.visit2_arrival_time,
        p.visit2_arrival_flight_no,
        p.visit2_departure_date,
        p.visit2_hotel_name,
        p.visit2_date,
        p.visit2_arrival_transfer_arranged,
        p.visit2_departure_transfer_arranged,
        p.visit2_hotel_arranged,
      ],
    ] as const) {
      if (arrivalDate === in7) {
        addLine(
          p.responsible_seller_id,
          `🗓 <b>${p.name}</b> (${visit}) arrives in 7 days${flightLine(arrivalTime, arrivalFlight)}${missingWarning([{ label: "transfer", ok: arrivalTransferArranged }, { label: "hotel", ok: hotelArranged }])}`
        );
      }
      if (arrivalDate === in1) {
        addLine(
          p.responsible_seller_id,
          `🛬 <b>${p.name}</b> (${visit}) arrives <b>tomorrow</b>${flightLine(arrivalTime, arrivalFlight)}${hotel ? ` — ${hotel}` : ""}${missingWarning([{ label: "transfer", ok: arrivalTransferArranged }, { label: "hotel", ok: hotelArranged }])}`
        );
      }
      if (departureDate === in1) {
        addLine(
          p.responsible_seller_id,
          `🛫 <b>${p.name}</b> (${visit}) departs <b>tomorrow</b>${missingWarning([{ label: "transfer", ok: departureTransferArranged }])}`
        );
      }

      // Patients without flight details: remind off the clinic visit date itself.
      if (!arrivalDate) {
        if (visitDate === in7) {
          addLine(p.responsible_seller_id, `📍 <b>${p.name}</b> (${visit}) in 7 days`);
        }
        if (visitDate === in1) {
          addLine(p.responsible_seller_id, `📍 <b>${p.name}</b> (${visit}) <b>tomorrow</b>`);
        }
      }
    }
  }

  const { data: extraVisits, error: extraError } = await supabase
    .from("patient_visits")
    .select(
      "label, visit_date, arrival_date, arrival_transfer_arranged, hotel_arranged, status, patients(name, responsible_seller_id)"
    )
    .in("visit_date", [in1, in7])
    .eq("status", "upcoming");

  if (extraError) {
    return NextResponse.json({ error: extraError.message }, { status: 500 });
  }

  for (const v of (extraVisits ?? []) as unknown as {
    label: string;
    visit_date: string;
    arrival_date: string | null;
    arrival_transfer_arranged: boolean;
    hotel_arranged: boolean;
    patients: { name: string; responsible_seller_id: string } | null;
  }[]) {
    if (!v.patients) continue;
    const name = v.patients.name;
    // Only warn if they're flying in specifically for this extra visit — most are add-ons
    // during an already-arranged stay, so no separate arrival to arrange.
    const warning = v.arrival_date
      ? missingWarning([
          { label: "transfer", ok: v.arrival_transfer_arranged },
          { label: "hotel", ok: v.hotel_arranged },
        ])
      : "";
    if (v.visit_date === in7) {
      addLine(v.patients.responsible_seller_id, `🦷 <b>${name}</b> (${v.label}) in 7 days${warning}`);
    }
    if (v.visit_date === in1) {
      addLine(v.patients.responsible_seller_id, `🦷 <b>${name}</b> (${v.label}) <b>tomorrow</b>${warning}`);
    }
  }

  if (linesBySeller.size === 0) {
    return NextResponse.json({ sent: false, reason: "No reminders today" });
  }

  const { data: profiles } = await supabase.from("profiles").select("id, telegram_chat_id");
  const chatBySeller = new Map((profiles ?? []).map((p) => [p.id, p.telegram_chat_id as string | null]));
  const fallback = getFallbackChatId();

  let totalCount = 0;
  await Promise.all(
    [...linesBySeller.entries()].map(async ([sellerId, lines]) => {
      totalCount += lines.length;
      const chatIds = new Set<string>();
      const own = chatBySeller.get(sellerId);
      if (own) chatIds.add(own);
      if (fallback) chatIds.add(fallback);
      if (chatIds.size === 0) return;

      const text = `<b>Upcoming visits</b>\n\n${lines.join("\n")}`;
      await sendTelegramMessageToMany([...chatIds], text);
    })
  );

  return NextResponse.json({ sent: true, count: totalCount });
}
