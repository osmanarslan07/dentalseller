"use client";

import { Patient } from "@/types";
import { Button, Card } from "@/components/ui";
import { downloadCsv, patientsToCsv } from "@/lib/csv";

export function DataExportCard({ patients }: { patients: Patient[] }) {
  function handleExport() {
    const csv = patientsToCsv(patients);
    downloadCsv(`patients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Data export</h2>
      <p className="mb-4 text-sm text-slate-500">Download all {patients.length} patient records as a CSV file.</p>
      <Button variant="secondary" onClick={handleExport}>
        Export patients CSV
      </Button>
    </Card>
  );
}
