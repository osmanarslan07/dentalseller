import { Patient } from "@/types";
import { extrasTotalFor } from "@/lib/commission";

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
  "Visit 2 Date",
  "Visit 2 Expected",
  "Visit 2 Actual",
  "Visit 2 Status",
  "Visit 2 Extras",
  "Notes",
];

export function escapeCsv(value: string | number | null): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function patientsToCsv(patients: Patient[]): string {
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
      p.visit2_date,
      p.visit2_expected,
      p.visit2_actual,
      p.visit2_status,
      extrasTotalFor(p, "visit2") || null,
      p.notes,
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
