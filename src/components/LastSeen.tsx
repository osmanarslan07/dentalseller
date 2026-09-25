"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useDateFnsLocale, useT } from "@/i18n/client";

/** Seen within this window counts as online — the heartbeat pings every 60s, so this
 * leaves room for a missed ping or two. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

export function isOnline(lastSeenAt: string | null, now = Date.now()): boolean {
  return !!lastSeenAt && now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

/** Green "Online" dot, or "Seen 3 hours ago"; re-evaluates every 30s so an open page
 * doesn't keep showing someone as online long after they left. */
export function LastSeen({ lastSeenAt, lastSignInAt }: { lastSeenAt: string | null; lastSignInAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const t = useT();
  const locale = useDateFnsLocale();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (isOnline(lastSeenAt, now)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {t("Online")}
      </span>
    );
  }

  // Presence tracking is newer than most accounts — fall back to the last login Supabase
  // already recorded, so nobody shows as "never" just because they predate the heartbeat.
  const seen = lastSeenAt ?? lastSignInAt;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400" suppressHydrationWarning>
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      {seen ? t("Seen {when}", { when: formatDistanceToNowStrict(new Date(seen), { addSuffix: true, locale }) }) : t("Never signed in")}
    </span>
  );
}
