import { NextRequest, NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { monitoredCron } from "@/lib/job-runs";
import { getEnvChatsClinicId, getFallbackChatId, getGroupChatId, sendTelegramMessageToMany } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface VisitRow {
  name: string;
  responsible_seller_id: string;
  coordinator_id: string | null;
  treatment: string | null;
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

function flightValue(time: string | null, flightNo: string | null): string | null {
  const parts = [time, flightNo].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Only meaningful once we know a date's actually set — a patient with no flight info yet,
 * or who arranges their own transfer/hotel, shouldn't get nagged. */
function missingLine(items: { label: string; ok: boolean }[]): string | null {
  const missing = items.filter((i) => !i.ok).map((i) => i.label);
  return missing.length ? `⚠ Missing: ${missing.join(", ")}` : null;
}

/** One label:value line per known field — omits anything not set instead of printing a
 * blank, so a patient with no flight details yet still gets a clean, short card. */
function card(header: string, fields: (string | null)[]): string {
  return [header, ...fields.filter((f): f is string => f != null)].join("\n");
}

export const GET = monitoredCron("visit-reminders", async (request: NextRequest) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date();
  const in1 = format(addDays(today, 1), "yyyy-MM-dd");
  const in7 = format(addDays(today, 7), "yyyy-MM-dd");

  // Fetched up front (rather than only when building the send list) so every reminder line
  // below can name the responsible seller — the group now sees everyone's patients, not just
  // their own, so "who is this" is no longer implicit from whose chat it landed in.
  // Sellers include those without an account (no chat of their own) — their patients'
  // reminders still reach the clinic group and the patient's coordinator.
  const [{ data: profiles }, { data: sellers }] = await Promise.all([
    supabase.from("profiles").select("id, telegram_chat_id"),
    supabase.from("sellers").select("id, name, clinic_id"),
  ]);
  const clinicBySeller = new Map((sellers ?? []).map((s) => [s.id, s.clinic_id as string | null]));
  const chatByPerson = new Map((profiles ?? []).map((p) => [p.id, p.telegram_chat_id as string | null]));
  const nameBySeller = new Map((sellers ?? []).map((s) => [s.id, (s.name as string | null) || "Unassigned"]));

  const { data, error } = await supabase
    .from("patients")
    .select(
      "name, responsible_seller_id, coordinator_id, treatment, visit1_date, visit1_arrival_date, visit1_arrival_time, visit1_arrival_flight_no, visit1_departure_date, visit1_departure_time, visit1_departure_flight_no, visit1_hotel_name, visit1_arrival_transfer_arranged, visit1_departure_transfer_arranged, visit1_hotel_arranged, visit2_date, visit2_arrival_date, visit2_arrival_time, visit2_arrival_flight_no, visit2_departure_date, visit2_departure_time, visit2_departure_flight_no, visit2_hotel_name, visit2_arrival_transfer_arranged, visit2_departure_transfer_arranged, visit2_hotel_arranged"
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

  // Grouped per responsible seller — each seller gets only their own patients' reminders,
  // and so does each of those patients' coordinators.
  const linesBySeller = new Map<string, string[]>();
  const coordinatorsBySeller = new Map<string, Set<string>>();
  const addLine = (p: { responsible_seller_id: string; coordinator_id: string | null }, line: string) => {
    const list = linesBySeller.get(p.responsible_seller_id) ?? [];
    list.push(line);
    linesBySeller.set(p.responsible_seller_id, list);
    if (p.coordinator_id) {
      const set = coordinatorsBySeller.get(p.responsible_seller_id) ?? new Set<string>();
      set.add(p.coordinator_id);
      coordinatorsBySeller.set(p.responsible_seller_id, set);
    }
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
      const seller = nameBySeller.get(p.responsible_seller_id) ?? "Unassigned";
      const treatmentLine = p.treatment ? `Treatment: ${p.treatment}` : null;
      const sellerLine = `Seller: ${seller}`;

      if (arrivalDate === in7) {
        addLine(
          p,
          card(`🗓 <b>${p.name}</b> — ${visit} arrival, in 7 days`, [
            sellerLine,
            treatmentLine,
            flightValue(arrivalTime, arrivalFlight) ? `Flight: ${flightValue(arrivalTime, arrivalFlight)}` : null,
            missingLine([{ label: "transfer", ok: arrivalTransferArranged }, { label: "hotel", ok: hotelArranged }]),
          ])
        );
      }
      if (arrivalDate === in1) {
        addLine(
          p,
          card(`🛬 <b>${p.name}</b> — ${visit} arrival, tomorrow`, [
            sellerLine,
            treatmentLine,
            flightValue(arrivalTime, arrivalFlight) ? `Flight: ${flightValue(arrivalTime, arrivalFlight)}` : null,
            hotel ? `Hotel: ${hotel}` : null,
            missingLine([{ label: "transfer", ok: arrivalTransferArranged }, { label: "hotel", ok: hotelArranged }]),
          ])
        );
      }
      if (departureDate === in1) {
        addLine(
          p,
          card(`🛫 <b>${p.name}</b> — ${visit} departure, tomorrow`, [
            sellerLine,
            missingLine([{ label: "transfer", ok: departureTransferArranged }]),
          ])
        );
      }

      // Patients without flight details: remind off the clinic visit date itself.
      if (!arrivalDate) {
        if (visitDate === in7) {
          addLine(p, card(`📍 <b>${p.name}</b> — ${visit}, in 7 days`, [sellerLine, treatmentLine]));
        }
        if (visitDate === in1) {
          addLine(p, card(`📍 <b>${p.name}</b> — ${visit}, tomorrow`, [sellerLine, treatmentLine]));
        }
      }
    }
  }

  const { data: extraVisits, error: extraError } = await supabase
    .from("patient_visits")
    .select(
      "label, visit_date, arrival_date, arrival_transfer_arranged, hotel_arranged, status, patients(name, responsible_seller_id, coordinator_id)"
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
    patients: { name: string; responsible_seller_id: string; coordinator_id: string | null } | null;
  }[]) {
    if (!v.patients) continue;
    const name = v.patients.name;
    const seller = nameBySeller.get(v.patients.responsible_seller_id) ?? "Unassigned";
    // Only warn if they're flying in specifically for this extra visit — most are add-ons
    // during an already-arranged stay, so no separate arrival to arrange.
    const warning = v.arrival_date
      ? missingLine([
          { label: "transfer", ok: v.arrival_transfer_arranged },
          { label: "hotel", ok: v.hotel_arranged },
        ])
      : null;
    if (v.visit_date === in7) {
      addLine(
        v.patients,
        card(`🦷 <b>${name}</b> — ${v.label}, in 7 days`, [`Seller: ${seller}`, warning])
      );
    }
    if (v.visit_date === in1) {
      addLine(
        v.patients,
        card(`🦷 <b>${name}</b> — ${v.label}, tomorrow`, [`Seller: ${seller}`, warning])
      );
    }
  }

  if (linesBySeller.size === 0) {
    return NextResponse.json({ sent: false, reason: "No reminders today" });
  }

  // Every clinic gets its own group (Settings → Team Telegram group); the env chats only ever
  // go to the clinic that owns them. A seller and their patients always share a clinic, so the
  // seller's clinic decides where their lines go.
  const [{ data: configs }, { data: clinics }, envChatsClinicId] = await Promise.all([
    supabase.from("clinic_config").select("clinic_id, telegram_group_chat_id"),
    supabase.from("clinics").select("id, is_active"),
    getEnvChatsClinicId(),
  ]);
  const groupByClinic = new Map((configs ?? []).map((c) => [c.clinic_id as string, c.telegram_group_chat_id as string | null]));
  const activeClinics = new Set((clinics ?? []).filter((c) => c.is_active).map((c) => c.id as string));

  let totalCount = 0;
  await Promise.all(
    [...linesBySeller.entries()].map(async ([sellerId, lines]) => {
      const clinicId = clinicBySeller.get(sellerId) ?? null;
      if (!clinicId || !activeClinics.has(clinicId)) return; // suspended clinics get nothing
      totalCount += lines.length;
      const chatIds = new Set<string>();
      for (const personId of [sellerId, ...(coordinatorsBySeller.get(sellerId) ?? [])]) {
        const own = chatByPerson.get(personId);
        if (own) chatIds.add(own);
      }
      const fallback = getFallbackChatId(clinicId, envChatsClinicId);
      if (fallback) chatIds.add(fallback);
      const group = getGroupChatId(clinicId, groupByClinic.get(clinicId) ?? null, envChatsClinicId);
      if (group) chatIds.add(group);
      if (chatIds.size === 0) return;

      const text = `<b>Upcoming visits</b>\n\n${lines.join("\n\n")}`;
      await sendTelegramMessageToMany([...chatIds], text);
    })
  );

  return NextResponse.json({ sent: true, count: totalCount });
});
