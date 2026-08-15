import { Patient } from "@/types";

const HEADERS = [
  "Name",
  "Treatment",
  "Confirmation Date",
  "Visit 1 Date",
  "Visit 1 Expected",
  "Visit 1 Actual",
  "Visit 1 Status",
  "Visit 2 Date",
  "Visit 2 Expected",
  "Visit 2 Actual",
  "Visit 2 Status",
  "Notes",
];

function escapeCsv(value: string | number | null): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function patientsToCsv(patients: Patient[]): string {
  const rows = patients.map((p) =>
    [
      p.name,
      p.treatment,
      p.confirmation_date,
      p.visit1_date,
      p.visit1_expected,
      p.visit1_actual,
      p.visit1_status,
      p.visit2_date,
      p.visit2_expected,
      p.visit2_actual,
      p.visit2_status,
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
