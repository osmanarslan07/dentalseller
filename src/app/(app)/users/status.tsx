import { formatDistanceToNowStrict } from "date-fns";
import { Badge } from "@/components/ui";
import type { AccountStatus } from "@/lib/data";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  invited: "Invited",
  inactive: "Inactive",
};

export function parseStatus(value: string | undefined): AccountStatus | null {
  return value === "active" || value === "invited" || value === "inactive" ? value : null;
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  const tone = status === "active" ? "green" : status === "invited" ? "blue" : "amber";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function lastActiveText(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 2 * 60 * 1000) return "Just now";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}
