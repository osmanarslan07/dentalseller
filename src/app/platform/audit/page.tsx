import { AUDIT_LOG_LIMIT, getPlatformAuditLog, PLATFORM_ACTION_LABELS } from "@/lib/platform";
import { AuditLogClient } from "./AuditLogClient";

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  const [{ clinic }, { entries, clinics }] = await Promise.all([searchParams, getPlatformAuditLog()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything done from the platform area, by every superadmin. Clinics&apos; own activity isn&apos;t shown here.
        </p>
      </div>
      <AuditLogClient
        entries={entries}
        actionOptions={Object.entries(PLATFORM_ACTION_LABELS)}
        clinicOptions={clinics}
        initialClinic={clinic ?? "all"}
        limit={AUDIT_LOG_LIMIT}
      />
    </div>
  );
}
