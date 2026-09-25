import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClinicAccounts, getPatients, getProfiles, getSellers } from "@/lib/data";
import { can, requirePagePermission } from "@/lib/permissions";
import { getClinicRoles } from "@/lib/roles";
import { signedAvatarUrls } from "@/lib/avatars";
import { peopleNameMap } from "@/lib/sellers";
import { ActivityLogRow, describeActivity, formatActivityTime } from "@/lib/activity-log";
import { activityQuery, parseActivityFilters } from "@/lib/activity-filters";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { PermissionSummary } from "@/components/PermissionSummary";
import { Card } from "@/components/ui";
import { Patient, Permission } from "@/types";
import { StatusBadge, lastActiveText } from "../status";
import { UserActions } from "./UserActions";
import { HandoverForm } from "./HandoverForm";
import { WORKLOAD_DAYS, coordinatorWorkload, getCoordinatorOptions } from "@/lib/coordinators";
import { todayIsoLocal } from "@/lib/balance";
import { ReactNode } from "react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_ACTIVITY = 20;
const PATIENT_LIST_MAX = 50;

/** One account of the clinic: details, roles, what they can do, their recent activity and
 * their patients. Everything is read through RLS, so another clinic's id is simply not found. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePagePermission(["team.view", "team.manage"]);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const profiles = await getProfiles(supabase);
  const profile = profiles.find((p) => p.id === id);
  if (!profile) notFound();

  const canActivity = can(viewer, "activity.view");
  const canPatients = can(viewer, "patients.view");
  const [[account], roles, avatars, sellers, patients, activity] = await Promise.all([
    getClinicAccounts([profile]),
    getClinicRoles(supabase, viewer.clinicId),
    signedAvatarUrls(supabase, [profile]),
    getSellers(supabase),
    canPatients || canActivity ? getPatients(supabase) : Promise.resolve([] as Patient[]),
    canActivity
      ? activityQuery(supabase, viewer.clinicId, parseActivityFilters({ actor: id })).limit(RECENT_ACTIVITY)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (activity.error) throw activity.error;

  const name = account.displayName || account.email || "Invited user";
  const permissions: Permission[] = [
    ...new Set(account.roles.flatMap((key) => roles.find((r) => r.key === key)?.permissions ?? [])),
  ];
  const nameById = peopleNameMap(profiles, sellers);
  const patientNameById = new Map(patients.map((p) => [p.id, p.name]));
  const entries = (activity.data ?? []) as ActivityLogRow[];
  const asSeller = canPatients ? patients.filter((p) => p.responsible_seller_id === id) : [];
  const asCoordinator = canPatients ? patients.filter((p) => p.coordinator_id === id) : [];
  const isSelf = id === viewer.userId;
  // who could take over their patients: members who can coordinate (patients.edit), not them
  const coordinatorOptions = await getCoordinatorOptions(supabase, viewer.clinicId, profiles, patients);
  const heirs = coordinatorOptions.filter((c) => c.pickable && c.id !== id).map((c) => ({ id: c.id, name: c.name }));
  const workload = coordinatorWorkload(asCoordinator, todayIsoLocal()).get(id) ?? { active: 0, arriving: 0 };
  const canHandover = can(viewer, "team.manage") && can(viewer, "patients.edit");

  return (
    <div className="space-y-6">
      <Link href="/users" className="text-sm font-medium text-teal-700 hover:underline">
        ← Users
      </Link>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={name} url={avatars.get(id)} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">
                {account.displayName || <span className="text-slate-500">Not signed in yet</span>}
              </h1>
              {isSelf && <span className="text-sm text-slate-400">(you)</span>}
              <StatusBadge status={account.status} />
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Detail label="Email" value={account.email} />
              <Detail label="Phone" value={account.phone} />
              <Detail label="Last active" value={lastActiveText(account.lastActiveAt)} />
              <Detail label="Added" value={formatDate(account.createdAt)} />
            </dl>
          </div>
        </div>
      </Card>

      <UserActions
        member={{ id, displayName: account.displayName, phone: account.phone, roles: account.roles, isActive: account.isActive, name }}
        roles={roles}
        // unknown (null) when the viewer can't see patients — the delete dialog then always offers the handover
        coordinatedCount={canPatients ? asCoordinator.length : null}
        others={heirs}
        isSelf={isSelf}
        canManage={can(viewer, "team.manage")}
        canDelete={can(viewer, "team.delete")}
        permissionSummary={
          <PermissionSummary permissions={permissions} modules={viewer.modules} empty="Nothing — they have no roles." />
        }
      />

      {canActivity && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
            <Link href={`/activity?actor=${id}`} className="text-sm font-medium text-teal-700 hover:underline">
              All activity →
            </Link>
          </div>
          {entries.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <p className="text-sm text-slate-800">{describeActivity(e, nameById, patientNameById)}</p>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatActivityTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canPatients && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PatientList title="Patients as seller" patients={asSeller} empty="No patients credited to them." />
          <PatientList
            title="Patients as coordinator"
            patients={asCoordinator}
            empty="They coordinate no patients."
            summary={
              asCoordinator.length > 0
                ? `${workload.active} with a visit to come · ${workload.arriving} arriving in the next ${WORKLOAD_DAYS} days`
                : undefined
            }
            footer={
              canHandover && asCoordinator.length > 0 ? (
                <HandoverForm fromId={id} fromName={name} count={asCoordinator.length} others={heirs} />
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-slate-700">{value || "—"}</dd>
    </div>
  );
}

function PatientList({
  title,
  patients,
  empty,
  summary,
  footer,
}: {
  title: string;
  patients: Patient[];
  empty: string;
  summary?: string;
  footer?: ReactNode;
}) {
  const sorted = [...patients].sort((a, b) => (b.visit1_date ?? "").localeCompare(a.visit1_date ?? ""));
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-slate-100 px-5 py-4 text-base font-semibold text-slate-900">
        {title} <span className="ml-1 text-sm font-normal text-slate-400">{patients.length}</span>
        {summary && <span className="mt-0.5 block text-xs font-normal text-slate-500">{summary}</span>}
      </h2>
      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.slice(0, PATIENT_LIST_MAX).map((p) => (
            <li key={p.id}>
              <Link href={`/patients/${p.id}`} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm hover:bg-slate-50">
                <span className="truncate font-medium text-slate-800">{p.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{p.visit1_date ? formatDate(p.visit1_date) : "No date"}</span>
              </Link>
            </li>
          ))}
          {sorted.length > PATIENT_LIST_MAX && (
            <li className="px-5 py-2.5 text-xs text-slate-400">…and {sorted.length - PATIENT_LIST_MAX} more</li>
          )}
        </ul>
      )}
      {footer && <div className="px-5 pb-4">{footer}</div>}
    </Card>
  );
}
