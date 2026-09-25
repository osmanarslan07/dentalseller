import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountStatus, getClinicAccounts, getPatients, getProfiles, getSellers, getSettings } from "@/lib/data";
import { can, canAny, requirePagePermission } from "@/lib/permissions";
import { getClinicRoles } from "@/lib/roles";
import { signedAvatarUrls } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import { Badge, Card } from "@/components/ui";
import { AddUserPanel } from "./AddUserPanel";
import { SellersCard } from "./SellersCard";
import { STATUS_LABELS, StatusBadge, lastActiveText, parseStatus } from "./status";
import { WORKLOAD_DAYS, coordinatorWorkload, getCoordinatorOptions } from "@/lib/coordinators";
import { patientsHrefForCoordinator } from "@/lib/people-filter";
import { todayIsoLocal } from "@/lib/balance";

type Search = { tab?: string; q?: string; role?: string; status?: string };

const TEAM_VIEW = ["team.view", "team.manage"] as const;

/** Users (Admin menu): every login of the clinic, and — as a second tab — the sellers who get
 * credit for sales without one. team.view to see the accounts, sellers.manage for the sellers
 * tab; changing anything is checked again in each action. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requirePagePermission([...TEAM_VIEW, "sellers.manage"]);
  const params = await searchParams;
  const canAccounts = canAny(viewer, [...TEAM_VIEW]);
  const canSellers = can(viewer, "sellers.manage");
  const tab = params.tab === "sellers" && canSellers ? "sellers" : canAccounts ? "accounts" : "sellers";
  const supabase = await createClient();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Everyone who signs in to your clinic, and sellers who don&apos;t.</p>
      </div>

      {canAccounts && canSellers && (
        <div className="flex gap-1 border-b border-slate-200" role="tablist">
          {(
            [
              ["accounts", "Accounts", "/users"],
              ["sellers", "Sellers without an account", "/users?tab=sellers"],
            ] as const
          ).map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              role="tab"
              aria-selected={tab === id}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {tab === "accounts" ? (
        <AccountsTab
          supabase={supabase}
          clinicId={viewer.clinicId}
          currentUserId={viewer.userId}
          canManage={can(viewer, "team.manage")}
          canPatients={can(viewer, "patients.view")}
          q={(params.q ?? "").trim().slice(0, 100)}
          role={params.role ?? ""}
          status={parseStatus(params.status)}
        />
      ) : (
        <SellersTab supabase={supabase} currentUserId={viewer.userId} />
      )}
    </div>
  );
}

async function AccountsTab({
  supabase,
  clinicId,
  currentUserId,
  canManage,
  canPatients,
  q,
  role,
  status,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  clinicId: string;
  currentUserId: string;
  canManage: boolean;
  canPatients: boolean;
  q: string;
  role: string;
  status: AccountStatus | null;
}) {
  const profiles = await getProfiles(supabase);
  const [accounts, roles, avatars] = await Promise.all([
    getClinicAccounts(profiles),
    getClinicRoles(supabase, clinicId),
    signedAvatarUrls(supabase, profiles),
  ]);
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? "Custom role";

  const needle = q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  const shown = accounts.filter(
    (a) =>
      (!needle ||
        (a.displayName ?? "").toLowerCase().includes(needle) ||
        (a.email ?? "").toLowerCase().includes(needle) ||
        (digits.length >= 3 && (a.phone ?? "").includes(digits))) &&
      (!role || a.roles.includes(role as never)) &&
      (!status || a.status === status)
  );
  const filtered = !!(q || role || status);

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <form action="/users" className="flex flex-1 flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email or phone…"
            aria-label="Search users"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
          />
          <select name="role" defaultValue={role} aria-label="Role" className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status ?? ""} aria-label="Status" className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            Filter
          </button>
          {filtered && (
            <Link href="/users" className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
              Reset
            </Link>
          )}
        </form>
        {canManage && <AddUserPanel roles={roles} />}
      </div>

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            {filtered ? "Nobody matches these filters." : "No users yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 md:table-header-group">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Roles</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3 text-right">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((a) => {
                const name = a.displayName || a.email || "Invited user";
                return (
                  <tr key={a.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50 md:table-row md:p-0">
                    <td className="flex min-w-0 flex-1 items-center gap-3 md:px-5 md:py-3">
                      <Avatar name={name} url={avatars.get(a.id)} />
                      <div className="min-w-0">
                        <Link href={`/users/${a.id}`} className="font-medium text-slate-900 after:absolute after:inset-0 hover:underline">
                          {a.displayName || <span className="text-slate-500">Not signed in yet</span>}
                        </Link>
                        {a.id === currentUserId && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                        <p className="truncate text-xs text-slate-400">{a.email}</p>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 md:table-cell">{a.phone ?? <span className="text-slate-300">—</span>}</td>
                    <td className="order-last w-full pl-11 md:order-none md:w-auto md:px-3 md:py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.roles.map((key) => (
                          <Badge key={key} tone={key === "admin" ? "blue" : "slate"}>
                            {roleName(key)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="md:px-3 md:py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-right text-xs text-slate-500 md:table-cell">
                      {lastActiveText(a.lastActiveAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {canPatients && <WorkloadCard supabase={supabase} clinicId={clinicId} profiles={profiles} />}
    </>
  );
}

/** Who coordinates how much: patients with a visit still to come, and arrivals soon. The
 * numbers open the patients list filtered to that coordinator. */
async function WorkloadCard({
  supabase,
  clinicId,
  profiles,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  clinicId: string;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
}) {
  const patients = await getPatients(supabase);
  const coordinators = await getCoordinatorOptions(supabase, clinicId, profiles, patients);
  const workload = coordinatorWorkload(patients, todayIsoLocal());
  const unassigned = patients.filter((p) => !p.coordinator_id).length;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Coordinators</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Patients with a visit still to come, and arrivals in the next {WORKLOAD_DAYS} days.{" "}
          <Link href="/patients?coordinator=none" className="font-medium text-teal-700 hover:underline">
            {unassigned} patient{unassigned === 1 ? "" : "s"} without a coordinator
          </Link>
        </p>
      </div>
      {coordinators.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Nobody can coordinate patients yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5">Coordinator</th>
              <th className="px-3 py-2.5 text-right">Active patients</th>
              <th className="px-5 py-2.5 text-right">Arriving</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coordinators.map((c) => {
              const w = workload.get(c.id) ?? { active: 0, arriving: 0 };
              return (
                <tr key={c.id}>
                  <td className="px-5 py-2.5">
                    <Link href={`/users/${c.id}`} className="font-medium text-slate-800 hover:underline">
                      {c.name}
                    </Link>
                    {!c.pickable && <span className="ml-1.5 text-xs text-slate-400">(can no longer coordinate)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <Link href={patientsHrefForCoordinator(c.id)} className="text-teal-700 hover:underline">
                      {w.active}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{w.arriving}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

async function SellersTab({
  supabase,
  currentUserId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  currentUserId: string;
}) {
  const [patients, sellers] = await Promise.all([getPatients(supabase), getSellers(supabase)]);
  const rows = await Promise.all(
    sellers
      .filter((s) => !s.profile_id)
      .map(async (seller) => ({
        seller,
        patientCount: patients.filter((p) => p.responsible_seller_id === seller.id).length,
        commission: await getSettings(supabase, seller.id),
      }))
  );
  return <SellersCard rows={rows} allSellers={sellers} currentUserId={currentUserId} />;
}
