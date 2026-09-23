import { ClinicBilling, TRIAL_WARNING_DAYS, trialStatus } from "@/lib/clinic-billing";

/** Automatic "needs attention" checks for the platform area. Pure — no DB access — so the
 * rules and thresholds live in one place, separate from how the inputs get fetched. */

export type HealthSeverity = "critical" | "warning" | "info";

export interface HealthFlag {
  id:
    | "no_active_admin"
    | "trial_expired"
    | "trial_ending"
    | "over_seat_limit"
    | "terms_not_accepted"
    | "inactive"
    | "never_signed_in"
    | "branding_incomplete";
  severity: HealthSeverity;
  label: string;
  /** What's wrong, and what to do about it. */
  detail: string;
}

export const INACTIVE_AFTER_DAYS = 7;

const SEVERITY_RANK: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2 };

export interface ClinicHealthInput {
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  members: { role: string; isActive: boolean; lastSignInAt: string | null }[];
  branding: { address: string; phone: string; email: string; logoUrl: string | null } | null;
  billing: ClinicBilling | null;
  /** null = acceptance not enforced yet, so never flagged */
  termsAccepted?: boolean | null;
}

export function computeHealthFlags(input: ClinicHealthInput, now = Date.now()): HealthFlag[] {
  // A suspended clinic is idle on purpose — flagging it would only be noise.
  if (!input.isActive) return [];

  const flags: HealthFlag[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  if (!input.members.some((m) => m.role === "admin" && m.isActive)) {
    flags.push({
      id: "no_active_admin",
      severity: "critical",
      label: "No active admin",
      detail: "Nobody at this clinic can manage its team or branding. If their admin is just locked out, reset that admin's password below.",
    });
  }

  const trial = trialStatus(input.billing, now);
  if (trial.kind === "expired") {
    flags.push({
      id: "trial_expired",
      severity: "critical",
      label: "Trial expired",
      detail: `The trial ended ${trial.daysAgo === 0 ? "today" : `${trial.daysAgo} day${trial.daysAgo === 1 ? "" : "s"} ago`}. Move them to a paid plan or extend the trial below.`,
    });
  } else if (trial.kind === "active" && trial.daysLeft <= TRIAL_WARNING_DAYS) {
    flags.push({
      id: "trial_ending",
      severity: "warning",
      label: trial.daysLeft === 0 ? "Trial ends today" : `Trial ends in ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"}`,
      detail: "Worth a conversation about which plan they want before the trial runs out.",
    });
  }

  if (input.termsAccepted === false) {
    flags.push({
      id: "terms_not_accepted",
      severity: "warning",
      label: "Terms not accepted",
      detail: "No admin has accepted the current terms of service yet. They'll be asked on their next sign-in.",
    });
  }

  const activeAccounts = input.members.filter((m) => m.isActive).length;
  const seatLimit = input.billing?.seatLimit;
  if (seatLimit && activeAccounts > seatLimit) {
    flags.push({
      id: "over_seat_limit",
      severity: "warning",
      label: `Over seat limit (${activeAccounts}/${seatLimit})`,
      detail: "More active accounts than the plan allows, probably because the limit was lowered. New accounts are blocked until they are back under it.",
    });
  }

  // A brand-new clinic hasn't had a chance to be active yet — measure from its creation.
  const idleSince = input.lastActivityAt ?? input.createdAt;
  const idleDays = Math.floor((now - new Date(idleSince).getTime()) / dayMs);
  if (idleDays >= INACTIVE_AFTER_DAYS) {
    flags.push({
      id: "inactive",
      severity: "warning",
      label: `Inactive ${idleDays} days`,
      detail: input.lastActivityAt
        ? `Nothing has been recorded in ${idleDays} days. Worth checking in with the clinic.`
        : `No activity at all since the clinic was created ${idleDays} days ago.`,
    });
  }

  const neverSignedIn = input.members.filter((m) => m.isActive && !m.lastSignInAt).length;
  if (neverSignedIn > 0) {
    flags.push({
      id: "never_signed_in",
      severity: "info",
      label: `${neverSignedIn} never signed in`,
      detail: `${neverSignedIn} account${neverSignedIn === 1 ? " was" : "s were"} created but never used. The temporary password may not have reached them.`,
    });
  }

  const b = input.branding;
  const missing = !b
    ? ["address", "phone", "email", "logo"]
    : [
        !b.address.trim() && "address",
        !b.phone.trim() && "phone",
        !b.email.trim() && "email",
        !b.logoUrl && "logo",
      ].filter((x): x is string => !!x);
  if (missing.length > 0) {
    flags.push({
      id: "branding_incomplete",
      severity: "info",
      label: "Branding incomplete",
      detail: `Missing ${missing.join(", ")}, so confirmation letters and offers print without it. The clinic admin can fill this in under Settings → Confirmation letter branding.`,
    });
  }

  return flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Worst severity present, or null when the clinic is healthy. Flags come pre-sorted. */
export function worstSeverity(flags: HealthFlag[]): HealthSeverity | null {
  return flags[0]?.severity ?? null;
}

export function severityRank(severity: HealthSeverity | null): number {
  return severity ? SEVERITY_RANK[severity] : 3;
}
