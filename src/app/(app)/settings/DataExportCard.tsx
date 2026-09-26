"use client";

import { Card } from "@/components/ui";
import { useT } from "@/i18n/client";

/** `count` is shown; the file itself is built by /settings/export/patients when asked for. */
export function DataExportCard({ count }: { count: number }) {
  const t = useT();
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Data export")}</h2>
      <p className="mb-4 text-sm text-slate-500">{t("Download all {n} patient records as a CSV file.", { n: count })}</p>
      {/* a plain link: the route answers with the file as a download */}
      <a
        href="/settings/export/patients"
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition duration-150 hover:bg-slate-200 active:scale-[0.97]"
      >
        {t("Export patients CSV")}
      </a>
    </Card>
  );
}
