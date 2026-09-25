import { getSuperadmins, requireSuperadmin } from "@/lib/platform";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { AddSuperadminForm } from "./AddSuperadminForm";
import { LastSeen } from "@/components/LastSeen";
import { getT } from "@/i18n/server";

export default async function SuperadminsPage() {
  const [{ user }, superadmins] = await Promise.all([requireSuperadmin(), getSuperadmins()]);
  const t = await getT();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("Superadmins")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("People who run the platform: they can create and suspend clinics, and see every clinic's counts.")}
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {superadmins.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {s.displayName || t("Unnamed")}
                  {s.id === user.id && <span className="ml-2 text-xs font-normal text-slate-400">{t("(you)")}</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{s.email ?? "—"}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <LastSeen lastSeenAt={s.lastSeenAt} lastSignInAt={s.lastSignInAt} />
                <span className="text-xs text-slate-400">{t("since {date}", { date: formatDate(s.createdAt.slice(0, 10)) })}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <AddSuperadminForm />
    </div>
  );
}
