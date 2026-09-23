import Link from "next/link";
import { HealthFlag, HealthSeverity, severityRank, worstSeverity } from "@/lib/clinic-health";
import { Badge, Card } from "@/components/ui";

const TONE: Record<HealthSeverity, "red" | "amber" | "slate"> = { critical: "red", warning: "amber", info: "slate" };
const DOT: Record<HealthSeverity, string> = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-slate-400" };

/** Compact table cell: a colored dot plus "Healthy" or the worst issue's label. */
export function HealthSummary({ flags }: { flags: HealthFlag[] }) {
  const worst = worstSeverity(flags);
  if (!worst) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Healthy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[worst]}`} />
      {flags[0].label}
      {flags.length > 1 && <span className="text-slate-400">+{flags.length - 1}</span>}
    </span>
  );
}

/** Full list with explanations, for a single clinic's page. */
export function HealthCard({ flags }: { flags: HealthFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Needs attention</h2>
      <ul className="mt-3 space-y-3">
        {flags.map((flag) => (
          <li key={flag.id} className="flex items-start gap-3">
            <Badge tone={TONE[flag.severity]}>{flag.label}</Badge>
            <p className="pt-0.5 text-sm text-slate-600">{flag.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Overview panel: every flagged clinic, worst first, so problems stand out without
 * opening each clinic. */
export function NeedsAttentionPanel({ clinics }: { clinics: { id: string; name: string; health: HealthFlag[] }[] }) {
  const flagged = clinics
    .filter((c) => c.health.length > 0)
    .sort((a, b) => severityRank(worstSeverity(a.health)) - severityRank(worstSeverity(b.health)));
  if (flagged.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        All clinics healthy — nothing needs attention.
      </p>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Needs attention</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {flagged.map((clinic) => (
          <li key={clinic.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
            <Link href={`/platform/clinics/${clinic.id}`} className="mr-1 text-sm font-medium text-slate-900 hover:text-teal-700">
              {clinic.name}
            </Link>
            {clinic.health.map((flag) => (
              <Badge key={flag.id} tone={TONE[flag.severity]}>
                {flag.label}
              </Badge>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
