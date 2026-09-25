"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AnnouncementLevel, isDismissible, LiveAnnouncement } from "@/lib/announcements";
import { useT } from "@/i18n/client";

const STORAGE_KEY = "ds-dismissed-announcements";
// localStorage fires "storage" only in *other* tabs; this event notifies the current one.
const CHANGE_EVENT = "ds-announcements-dismissed";

const STYLES: Record<AnnouncementLevel, { bar: string; icon: string; label: string }> = {
  info: { bar: "bg-blue-50 text-blue-900 border-blue-100", icon: "text-blue-600", label: "Announcement" },
  warning: { bar: "bg-amber-50 text-amber-900 border-amber-100", icon: "text-amber-600", label: "Heads up" },
  critical: { bar: "bg-red-50 text-red-900 border-red-100", icon: "text-red-600", label: "Important" },
};

// Dismissals are a per-browser convenience; storage can be unavailable (private mode,
// blocked site data), in which case banners simply stay visible.
function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseIds(raw: string): string[] {
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore — see readRaw
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function LevelIcon({ className }: { className: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" strokeLinecap="round" />
    </svg>
  );
}

/** Banners from the platform, above the nav. On the server the dismissed list is unknown
 * (null), so dismissible banners only appear once the client has checked storage — a
 * dismissed banner never flashes back on load. */
export function AnnouncementBanner({ announcements }: { announcements: LiveAnnouncement[] }) {
  const t = useT();
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const dismissed = useMemo(() => (raw === null ? null : parseIds(raw)), [raw]);

  function dismiss(id: string) {
    // Keep only still-live ids, so dismissals of ended announcements don't pile up forever.
    const liveIds = new Set(announcements.map((a) => a.id));
    writeDismissed([...(dismissed ?? []).filter((d) => liveIds.has(d)), id]);
  }

  const visible = announcements.filter((a) =>
    isDismissible(a.level) ? dismissed !== null && !dismissed.includes(a.id) : true
  );
  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label={t("Announcements")}>
      {visible.map((a) => (
        <AnnouncementBar key={a.id} level={a.level} message={a.message} onDismiss={() => dismiss(a.id)} />
      ))}
    </div>
  );
}

/** One banner row — shared by the live banner and the platform area's preview. */
export function AnnouncementBar({
  level,
  message,
  onDismiss,
}: {
  level: AnnouncementLevel;
  message: string;
  onDismiss?: () => void;
}) {
  const style = STYLES[level];
  const t = useT();
  return (
    <div className={`border-b ${style.bar}`}>
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <LevelIcon className={`mt-0.5 ${style.icon}`} />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{t(style.label)}: </span>
          <span className="whitespace-pre-line break-words">{message}</span>
        </p>
        {isDismissible(level) && (
          <button
            type="button"
            onClick={onDismiss}
            className="-my-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100"
            aria-label={t("Dismiss announcement")}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
