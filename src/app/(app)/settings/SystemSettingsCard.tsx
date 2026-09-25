"use client";

import { useState, useTransition } from "react";
import { ClinicConfig } from "@/types";
import { Button, Card, Input, Label } from "@/components/ui";
import { saveSystemSettings } from "./actions";
import { useT } from "@/i18n/client";

export function SystemSettingsCard({ clinicConfig }: { clinicConfig: ClinicConfig }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const t = useT();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveSystemSettings(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Something went wrong"));
      }
    });
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Payments & commission")}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {t("Clinic-wide rules for how money is counted. They apply to every seller.")}
      </p>

      <form action={handleSubmit} className="space-y-5">
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="deduct_costs_from_commission"
              defaultChecked={clinicConfig.deductCostsFromCommission}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
            />
            <span>
              <span className="font-medium">{t("Deduct hotel and transfer costs before commission")}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {t("Commission is worked out on what the patient paid minus the visit's hotel cost and external transfer costs. Visits with no costs entered aren't affected. Applies to past visits too, so changing it can change earlier months' commission.")}
              </span>
            </span>
          </label>
        </div>

        <div className="max-w-xs">
          <Label>{t("Card payment surcharge (%)")}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="card_surcharge_rate"
            defaultValue={Number((clinicConfig.cardSurchargeRate * 100).toFixed(2)).toString()}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("Optional per card payment. The surcharge never counts toward commission.")}
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t("Settings saved.")}</p>}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("Saving…") : t("Save settings")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
