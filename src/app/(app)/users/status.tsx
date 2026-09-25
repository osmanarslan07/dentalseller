import { formatDistanceToNowStrict } from "date-fns";
import { Badge } from "@/components/ui";
import type { AccountStatus } from "@/lib/data";
import { dateFnsLocaleOf, Lang, makeT, msg, T } from "@/i18n";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: msg("Active"),
  invited: msg("Invited"),
  inactive: msg("Inactive"),
};

export function parseStatus(value: string | undefined): AccountStatus | null {
  return value === "active" || value === "invited" || value === "inactive" ? value : null;
}

export function StatusBadge({ status, t = makeT("en") }: { status: AccountStatus; t?: T }) {
  const tone = status === "active" ? "green" : status === "invited" ? "blue" : "amber";
  return <Badge tone={tone}>{t(STATUS_LABELS[status])}</Badge>;
}

export function lastActiveText(iso: string | null, lang: Lang = "en"): string {
  const t = makeT(lang);
  if (!iso) return t("Never");
  const ms = Date.now() - Date.parse(iso);
  if (ms < 2 * 60 * 1000) return t("Just now");
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: dateFnsLocaleOf(lang) });
}
