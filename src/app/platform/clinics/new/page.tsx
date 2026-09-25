import { NewClinicForm } from "./NewClinicForm";
import { getT } from "@/i18n/server";

export default async function NewClinicPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("New clinic")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("Creates the clinic and its first admin account. The admin then adds their own sellers and fills in the clinic's letter branding from Settings.")}
        </p>
      </div>
      <NewClinicForm />
    </div>
  );
}
