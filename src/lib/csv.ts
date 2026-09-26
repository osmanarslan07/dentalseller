import { MoneyPatient } from "@/types";
import { extrasTotalFor, visitDiscount } from "@/lib/commission";

/** The visit's discount in money, or blank when there's none. */
function discountFor(p: MoneyPatient, visitKey: string, expected: number | null): number | null {
  return visitDiscount(p, visitKey, (expected ?? 0) + extrasTotalFor(p, visitKey)) || null;
}

const HEADERS = [
  "Name",
  "Phone",
  "Treatment",
  "Confirmation Date",
  "Visit 1 Date",
  "Visit 1 Expected",
  "Visit 1 Actual",
  "Visit 1 Status",
  "Visit 1 Extras",
  "Visit 1 Discount",
  "Visit 2 Date",
  "Visit 2 Expected",
  "Visit 2 Actual",
  "Visit 2 Status",
  "Visit 2 Extras",
  "Visit 2 Discount",
  "Notes",
  // amounts above are in the patient's own currency; the rate turns them into the main one
  "Currency",
  "Rate To Main Currency",
];

export function escapeCsv(value: string | number | null): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function patientsToCsv(patients: MoneyPatient[]): string {
  const rows = patients.map((p) =>
    [
      p.name,
      p.phone,
      p.treatment,
      p.confirmation_date,
      p.visit1_date,
      p.visit1_expected,
      p.visit1_actual,
      p.visit1_status,
      extrasTotalFor(p, "visit1") || null,
      discountFor(p, "visit1", p.visit1_expected),
      p.visit2_date,
      p.visit2_expected,
      p.visit2_actual,
      p.visit2_status,
      extrasTotalFor(p, "visit2") || null,
      discountFor(p, "visit2", p.visit2_expected),
      p.notes,
      p.currency,
      p.deal_rate,
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [HEADERS.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
