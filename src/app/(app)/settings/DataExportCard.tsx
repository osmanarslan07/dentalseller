"use client";

import { Patient } from "@/types";
import { Button, Card } from "@/components/ui";
import { downloadCsv, patientsToCsv } from "@/lib/csv";
import { useT } from "@/i18n/client";

export function DataExportCard({ patients }: { patients: Patient[] }) {
  const t = useT();
  function handleExport() {
    const csv = patientsToCsv(patients);
    downloadCsv(`patients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Data export")}</h2>
      <p className="mb-4 text-sm text-slate-500">{t("Download all {n} patient records as a CSV file.", { n: patients.length })}</p>
      <Button variant="secondary" onClick={handleExport}>
        {t("Export patients CSV")}
      </Button>
    </Card>
  );
}
