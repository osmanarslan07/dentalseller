import { Transfer } from "@/types";

/** The two message templates the clinic submits to Meta (WhatsApp Manager → Message templates,
 * category "Utility", language Turkish). The API can only start a conversation with a driver
 * through an approved template, and a template's variables can't contain line breaks — so
 * the one-transfer message has a line per field and the day list goes on a single line.
 * The bodies here are what Settings shows for copying; the parameters are filled below. */
export const TEMPLATE_SINGLE_BODY = [
  "🚗 TRANSFER",
  "Tarih: {{1}}",
  "Nereden: {{2}}",
  "Nereye: {{3}}",
  "Hasta: {{4}}",
  "Hasta tel: {{5}}",
  "Uçuş: {{6}}",
  "Not: {{7}}",
  "Sorunuz olursa lütfen kliniği arayın.",
].join("\n");

export const TEMPLATE_DAY_BODY = [
  "🚗 {{1}} tarihli transferleriniz ({{2}}):",
  "{{3}}",
  "Sorunuz olursa lütfen kliniği arayın.",
].join("\n");

/** Meta's example values, asked for when a template is submitted. */
export const TEMPLATE_SINGLE_EXAMPLE = ["05.10.2026 14:30", "Havalimanı", "Renex Otel", "Jane Smith (2 kişi)", "+44 7700 900123", "TK1987", "-"];
export const TEMPLATE_DAY_EXAMPLE = [
  "05.10.2026",
  "2 transfer",
  "1) 14:30 Havalimanı → Renex Otel · Jane Smith (2 kişi) · tel +44 7700 900123 · uçuş TK1987 | 2) 16:00 Renex Otel → Klinik · John Doe (1 kişi)",
];

/** Keeps the day list inside Meta's 1,024-character body limit, with room for the fixed text. */
const DAY_LIST_MAX = 850;

const dmy = (iso: string) => iso.split("-").reverse().join(".");

/** Meta rejects parameters with new lines, tabs or more than four spaces in a row, and empty ones. */
export function cleanParam(v: string | null | undefined): string {
  const s = (v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return s || "-";
}

export interface TransferForMessage {
  transfer: Transfer;
  patientName: string;
  patientPhone: string | null;
}

export function singleParams({ transfer: t, patientName, patientPhone }: TransferForMessage): string[] {
  const when = t.transfer_date ? `${dmy(t.transfer_date)} ${t.transfer_time ?? "(saat belirlenecek)"}` : "Tarih belirlenecek";
  return [when, t.from_place, t.to_place, `${patientName} (${t.pax} kişi)`, patientPhone, t.flight_no, t.notes].map(cleanParam);
}

function dayLine({ transfer: t, patientName, patientPhone }: TransferForMessage, n: number): string {
  return [
    `${n}) ${t.transfer_time ?? "saat ?"} ${t.from_place || "?"} → ${t.to_place || "?"}`,
    `${patientName} (${t.pax} kişi)`,
    patientPhone ? `tel ${patientPhone}` : null,
    t.flight_no ? `uçuş ${t.flight_no}` : null,
    t.notes ? `not: ${t.notes}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A driver's day as one or more day-list messages (split only when it's too long for one),
 * each with the positions of the items it covers. */
export function dayParams(date: string, items: TransferForMessage[]): { params: string[]; items: number[] }[] {
  const lines = items.map((item, i) => cleanParam(dayLine(item, i + 1)).slice(0, DAY_LIST_MAX));
  const chunks: number[][] = [[]];
  lines.forEach((line, i) => {
    const current = chunks[chunks.length - 1];
    if (current.length > 0 && [...current.map((j) => lines[j]), line].join(" | ").length > DAY_LIST_MAX) chunks.push([i]);
    else current.push(i);
  });
  return chunks.map((chunk, n) => ({
    items: chunk,
    params: [
      dmy(date),
      `${items.length} transfer${chunks.length > 1 ? `, ${n + 1}/${chunks.length}` : ""}`,
      chunk.map((j) => lines[j]).join(" | "),
    ],
  }));
}
