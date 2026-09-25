"use client";

import { ChangeEvent, useState, useTransition } from "react";
import { ClinicConfig } from "@/types";
import { Button, Card, Input, Label } from "@/components/ui";
import { saveClinicBranding } from "./actions";
import { useT } from "@/i18n/client";

export function BrandingCard({ clinicConfig }: { clinicConfig: ClinicConfig }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(clinicConfig.clinicLogoUrl);

  const t = useT();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveClinicBranding(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Something went wrong"));
      }
    });
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Confirmation letter branding")}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {t("Clinic name, contact details and logo — shared across every seller's confirmation letters and quote offers, not just your own.")}
      </p>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <Label>{t("Logo")}</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Clinic logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">{t("No logo")}</span>
              )}
            </div>
            <input
              type="file"
              name="clinic_logo"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoChange}
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">{t("PNG, JPEG, SVG or WebP, up to 2MB.")}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t("Clinic name (full)")}</Label>
            <Input name="clinic_name" defaultValue={clinicConfig.clinicName} required />
          </div>
          <div>
            <Label>{t("Clinic name (short)")}</Label>
            <Input name="clinic_short_name" defaultValue={clinicConfig.clinicShortName} required />
          </div>
        </div>
        <div>
          <Label>{t("Address")}</Label>
          <Input name="clinic_address" defaultValue={clinicConfig.clinicAddress} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t("Phone")}</Label>
            <Input name="clinic_phone" defaultValue={clinicConfig.clinicPhone} />
          </div>
          <div>
            <Label>{t("Email")}</Label>
            <Input type="email" name="clinic_email" defaultValue={clinicConfig.clinicEmail} />
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t("Settings saved.")}</p>}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("Saving…") : t("Save branding")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
