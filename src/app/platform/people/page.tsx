import { getAllPeople } from "@/lib/platform";
import { PeopleClient } from "./PeopleClient";
import { getT } from "@/i18n/server";

export default async function PlatformPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, people] = await Promise.all([searchParams, getAllPeople()]);

  const t = await getT();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("People")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("Every account on the platform. Search by name, email or clinic. Staff details only, never patient data.")}
        </p>
      </div>
      {/* keyed on q so a new search from the nav box resets the field */}
      <PeopleClient key={q ?? ""} people={people} initialQuery={q ?? ""} />
    </div>
  );
}
