import Link from "next/link";
import { AUDIT_LOG_LIMIT, getPlatformAuditLog, PLATFORM_ACTION_LABELS } from "@/lib/platform";
import { AuditLogClient } from "./AuditLogClient";
import { SupportLogView } from "./SupportLogView";

type Search = { tab?: string; clinic?: string; from?: string; to?: string };

const TABS = [
  { id: "platform", label: "Platform actions" },
  { id: "support", label: "Support access" },
] as const;

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = sp.tab === "support" ? "support" : "platform";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tab === "support"
            ? "Every support session inside a clinic: what was opened and what was changed. Tamper-evident, exportable on request. Clinics never see this page."
            : "Everything done from the platform area, by every superadmin. Clinics' own activity isn't shown here."}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Audit log sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "platform" ? "/platform/audit" : "/platform/audit?tab=support"}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "support" ? <SupportLogView clinic={sp.clinic} from={sp.from} to={sp.to} /> : <PlatformActions clinic={sp.clinic} />}
    </div>
  );
}

async function PlatformActions({ clinic }: { clinic?: string }) {
  const { entries, clinics } = await getPlatformAuditLog();
  return (
    <AuditLogClient
      entries={entries}
      actionOptions={Object.entries(PLATFORM_ACTION_LABELS)}
      clinicOptions={clinics}
      initialClinic={clinic ?? "all"}
      limit={AUDIT_LOG_LIMIT}
    />
  );
}
