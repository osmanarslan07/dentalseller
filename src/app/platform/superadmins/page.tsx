import { getSuperadmins, requireSuperadmin } from "@/lib/platform";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { AddSuperadminForm } from "./AddSuperadminForm";

export default async function SuperadminsPage() {
  const [{ user }, superadmins] = await Promise.all([requireSuperadmin(), getSuperadmins()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Superadmins</h1>
        <p className="mt-1 text-sm text-slate-500">
          People who run the platform: they can create and suspend clinics, and see every clinic&apos;s counts.
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {superadmins.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {s.displayName || "Unnamed"}
                  {s.id === user.id && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{s.email ?? "—"}</p>
              </div>
              <span className="text-xs text-slate-400">since {formatDate(s.createdAt.slice(0, 10))}</span>
            </li>
          ))}
        </ul>
      </Card>

      <AddSuperadminForm />
    </div>
  );
}
