import { Transfer } from "@/types";

/** Digits only — the form wa.me links want ("+90 555 123 45 67" → "905551234567"). */
export function waDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^\d]/g, "");
}

/** A phone number WhatsApp can plausibly open. */
export function isWhatsAppable(phone: string | null | undefined): boolean {
  return waDigits(phone).length >= 8;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
}

const dmy = (iso: string) => iso.split("-").reverse().join(".");

function transferLines(t: Transfer, patientName: string, patientPhone: string | null): string[] {
  return [
    `*Nereden:* ${t.from_place || "-"}`,
    `*Nereye:* ${t.to_place || "-"}`,
    `*Hasta:* ${patientName} (${t.pax} kişi)`,
    patientPhone ? `*Hasta tel:* ${patientPhone}` : null,
    t.flight_no ? `*Uçuş:* ${t.flight_no}` : null,
    t.notes ? `*Not:* ${t.notes}` : null,
  ].filter((l): l is string => l != null);
}

/** One transfer, for its driver — in Turkish, since the drivers are local. Only what they
 * need to do the job: when, where from/to, who (and how many), how to reach them, the flight. */
export function driverMessage(t: Transfer, patientName: string, patientPhone: string | null): string {
  const date = t.transfer_date ? dmy(t.transfer_date) : "Tarih belirlenecek";
  return [
    "🚗 *TRANSFER*",
    `*Tarih:* ${date}${t.transfer_time ? ` saat ${t.transfer_time}` : " (saat belirlenecek)"}`,
    ...transferLines(t, patientName, patientPhone),
  ].join("\n");
}

/** A driver's whole day in one message, in time order. */
export function driverDayMessage(
  date: string,
  items: { transfer: Transfer; patientName: string; patientPhone: string | null }[]
): string {
  const blocks = items.map(({ transfer: t, patientName, patientPhone }, i) =>
    [`*${i + 1}) ${t.transfer_time ?? "saat belirlenecek"}*`, ...transferLines(t, patientName, patientPhone)].join("\n")
  );
  return [`🚗 *TRANSFERLER — ${dmy(date)}* (${items.length})`, ...blocks].join("\n\n");
}
