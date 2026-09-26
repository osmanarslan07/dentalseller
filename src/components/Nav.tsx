"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { logout } from "@/lib/auth-actions";
import { Permission } from "@/types";
import { PIN_COOKIE } from "@/lib/nav-pin";
import { CLINIC_SECTIONS } from "@/app/(app)/settings/clinic/sections";
import { Avatar, initials } from "@/components/Avatar";
import { useT } from "@/i18n/client";
import { LanguageList } from "@/components/LanguageSwitch";

export function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PatientsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20c.6-3.4 3-5.3 5.5-5.3s4.9 1.9 5.5 5.3" strokeLinecap="round" />
      <path d="M15.5 6.2c1.4.3 2.5 1.6 2.5 3.1s-1.1 2.8-2.5 3.1" strokeLinecap="round" />
      <path d="M16.5 14.9c2 .5 3.5 2.2 4 5.1" strokeLinecap="round" />
    </svg>
  );
}

export function QuotesIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13h6M9 16.5h6" strokeLinecap="round" />
    </svg>
  );
}

function TasksIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 12.5 10.5 15 16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" strokeLinecap="round" />
      <path d="M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  );
}

function EarningsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TransfersIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 16V9l2-4h10l2 4v7M3 16h18M7 16v2M17 16v2M5 9h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccountingIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TeamIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 20c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" strokeLinecap="round" />
      <path d="M13 15.3c.6-.2 1.3-.3 2-.3 2.8 0 5 1.8 5.5 5" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.56 1.04H19.5a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


export function ActivityIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PerformanceIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" strokeLinecap="round" />
    </svg>
  );
}

function SlidersIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function SignOutIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h11m0 0-3.5-3.5M20 12l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Badge = "tasks" | "transfers";
type Item = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  /** What it takes to see it (null: everyone). */
  needs: Permission[] | null;
  badge?: Badge;
};

const CLINIC_SETTINGS_HREF = "/settings/clinic";

/** The menu, by group. A group with nothing the viewer may see is left out. */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Home", icon: HomeIcon, needs: null },
      { href: "/patients", label: "Patients", icon: PatientsIcon, needs: ["patients.view"] },
      { href: "/calendar", label: "Calendar", icon: CalendarIcon, needs: ["patients.view"] },
      { href: "/transfers", label: "Transfers", icon: TransfersIcon, needs: ["transfers.manage"], badge: "transfers" },
      { href: "/tasks", label: "Tasks", icon: TasksIcon, needs: ["tasks.use"], badge: "tasks" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/quotes", label: "Quotes", icon: QuotesIcon, needs: ["quotes.use"] },
      { href: "/earnings", label: "My earnings", icon: EarningsIcon, needs: ["earnings.own"] },
      { href: "/sales-performance", label: "Sales performance", icon: PerformanceIcon, needs: ["earnings.all"] },
    ],
  },
  {
    label: "Money",
    items: [{ href: "/accounting", label: "Accounting", icon: AccountingIcon, needs: ["accounting.view"] }],
  },
  {
    label: "Admin",
    items: [
      // the Users page also holds the sellers without an account
      { href: "/users", label: "Users", icon: TeamIcon, needs: ["team.view", "team.manage", "sellers.manage"] },
      { href: "/activity", label: "Activity", icon: ActivityIcon, needs: ["activity.view"] },
      {
        href: CLINIC_SETTINGS_HREF,
        label: "Clinic settings",
        icon: SettingsIcon,
        needs: CLINIC_SECTIONS.flatMap((sec) => sec.needs),
      },
    ],
  },
];

/** The phone bar: the pages used most on the move. Everything else sits under "More". */
const MOBILE_BAR = ["/", "/patients", "/transfers", "/tasks"];
const MOBILE_BAR_SIZE = MOBILE_BAR.length;

const MY_PROFILE_HREF = "/profile";
export const FOLD_DELAY_MS = 1000;
export const OPEN_DELAY_MS = 120;

/** A page is active on its own path and on anything under it (/patients/123 → Patients). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function CountPill({ n, tone, className = "" }: { n: number; tone: "warn" | "info"; className?: string }) {
  return (
    <span
      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        tone === "warn" ? "bg-red-100 text-red-700" : "bg-teal-100 text-teal-700"
      } ${className}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function BadgeDot({ tone, className = "" }: { tone: "warn" | "info"; className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-2.5 w-2.5 rounded-full border-2 border-white ${tone === "warn" ? "bg-red-500" : "bg-teal-500"} ${className}`}
    />
  );
}

export function AppShell({
  email,
  displayName,
  avatarUrl,
  permissions,
  userId,
  clinicName,
  clinicLogoUrl,
  badges,
  initialPinned,
  banners,
  children,
}: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  permissions: Permission[];
  userId: string;
  clinicName: string;
  clinicLogoUrl: string | null;
  badges: { tasks: number; transfers: number };
  initialPinned: boolean;
  /** Support bar and announcements: they sit above the top bar, beside the menu. */
  banners: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  const [pinned, setPinned] = useState(initialPinned);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const phoneSearchRef = useRef<HTMLInputElement>(null);
  const avatarWrapRef = useRef<HTMLDivElement>(null);

  const expanded = pinned || open;
  const canSearch = permissions.includes("patients.view");

  const groups = GROUPS.map((g) => ({
    ...g,
    label: t(g.label),
    items: g.items
      .filter((i) => !i.needs || i.needs.some((p) => permissions.includes(p)))
      .map((i) => ({ ...i, label: t(i.label) })),
  })).filter((g) => g.items.length > 0);
  const allItems = groups.flatMap((g) => g.items);

  // the usual four when allowed; a page someone can't see gives its place to the next one
  const barLinks = [
    ...MOBILE_BAR.map((href) => allItems.find((l) => l.href === href)).filter((l) => !!l),
    ...allItems.filter((l) => !MOBILE_BAR.includes(l.href)),
  ].slice(0, MOBILE_BAR_SIZE);
  const moreGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !barLinks.includes(i)) }))
    .filter((g) => g.items.length > 0);
  const moreActive = moreGroups.some((g) => g.items.some((i) => isActive(pathname, i.href)));

  const activeItem = allItems.find((i) => isActive(pathname, i.href));
  const pageTitle = activeItem?.label ?? (pathname === "/settings" ? t("My settings") : pathname === "/profile" ? t("My profile") : pathname.startsWith("/settings") ? t("Settings") : "");

  const badgeOf = (item: Item): { n: number; tone: "warn" | "info" } | null => {
    if (item.badge === "tasks" && badges.tasks > 0) return { n: badges.tasks, tone: "warn" };
    if (item.badge === "transfers" && badges.transfers > 0) return { n: badges.transfers, tone: "info" };
    return null;
  };

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (foldTimer.current) clearTimeout(foldTimer.current);
    openTimer.current = foldTimer.current = null;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const openSoon = () => {
    clearTimers();
    // a short pause, so passing the pointer over the rail doesn't make it flicker open
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const foldSoon = () => {
    clearTimers();
    foldTimer.current = setTimeout(() => setOpen(false), FOLD_DELAY_MS);
  };
  const foldNow = () => {
    clearTimers();
    setOpen(false);
  };

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    clearTimers();
    setOpen(false);
    try {
      document.cookie = `${PIN_COOKIE}_${userId}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // the choice just isn't remembered
    }
  }

  // the More sheet covers the page: no scrolling behind it, Escape closes it
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  // avatar menu: a click outside or Escape closes it
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!avatarWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Ctrl/Cmd+K jumps to the search
  useEffect(() => {
    if (!canSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) desktopSearchRef.current?.focus();
        else setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canSearch]);

  useEffect(() => {
    if (searchOpen) phoneSearchRef.current?.focus();
  }, [searchOpen]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/patients?q=${encodeURIComponent(q)}` : "/patients");
    setSearchOpen(false);
    desktopSearchRef.current?.blur();
  }

  const logo = clinicLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clinicLogoUrl} alt="" className="h-9 w-9 flex-none rounded-[10px] object-contain" />
  ) : (
    <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-teal-600 text-[13px] font-bold tracking-wide text-white">
      {initials(clinicName)}
    </span>
  );

  const avatar = <Avatar name={displayName || email} url={avatarUrl} />;

  return (
    <>
      {/* desktop / tablet: icon rail, opens over the page */}
      <nav
        aria-label={t("Main menu")}
        onMouseEnter={() => {
          hovering.current = true;
          if (!pinned) openSoon();
        }}
        onMouseLeave={() => {
          hovering.current = false;
          if (!pinned) foldSoon();
        }}
        onFocus={() => {
          if (pinned) return;
          clearTimers();
          setOpen(true);
        }}
        onBlur={(e) => {
          if (!pinned && !e.currentTarget.contains(e.relatedTarget) && !hovering.current) foldSoon();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !pinned) {
            foldNow();
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
        className={`fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none md:flex print:hidden ${
          expanded ? "w-60" : "w-16"
        } ${open && !pinned ? "shadow-xl" : ""}`}
      >
        <Link href="/" className="flex h-14 flex-none items-center gap-2.5 whitespace-nowrap border-b border-slate-200 pl-3.5 pr-3" title={clinicName}>
          {logo}
          <span className={`min-w-0 truncate text-sm font-semibold text-slate-900 transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>
            {clinicName}
          </span>
        </Link>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
          {groups.map((group, gi) => (
            <div key={group.label}>
              <div className={`relative flex items-center pl-3 ${gi === 0 ? "h-2" : "h-7"}`}>
                {gi > 0 && (
                  <>
                    <span className={`text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>
                      {group.label}
                    </span>
                    <span aria-hidden className={`absolute left-3 h-px w-6 bg-slate-300 transition-opacity duration-150 ${expanded ? "opacity-0" : "opacity-100"}`} />
                  </>
                )}
              </div>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const badge = badgeOf(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={expanded ? undefined : item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => {
                      // a click is a choice: the menu folds at once (unless pinned)
                      if (!pinned) {
                        foldNow();
                        e.currentTarget.blur();
                      }
                    }}
                    className={`relative flex h-10 items-center gap-3.5 whitespace-nowrap rounded-[9px] pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      active ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-[22px] w-[22px] flex-none" />
                    <span className={`transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>{item.label}</span>
                    {badge && (
                      <>
                        <CountPill
                          n={badge.n}
                          tone={badge.tone}
                          className={`ml-auto mr-2 transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}
                        />
                        {!expanded && <BadgeDot tone={badge.tone} className="left-[29px] top-1.5" />}
                        <span className="sr-only">{`${badge.n} ${item.badge === "tasks" ? t("overdue") : t("to confirm")}`}</span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex-none border-t border-slate-200 p-2">
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            title={expanded ? undefined : t("Keep menu open")}
            className={`flex h-10 w-full items-center gap-3.5 whitespace-nowrap rounded-[9px] pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
              pinned ? "text-teal-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <PinIcon className={`h-[22px] w-[22px] flex-none ${pinned ? "fill-teal-100" : ""}`} />
            <span className={`transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>
              {pinned ? t("Menu kept open") : t("Keep menu open")}
            </span>
          </button>
        </div>
      </nav>

      <div className={`transition-[padding] duration-200 ease-out motion-reduce:transition-none print:pl-0 ${pinned ? "md:pl-60" : "md:pl-16"}`}>
        {banners}

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            {/* phone: who we are; desktop: where we are */}
            <Link href="/" className="flex min-w-0 items-center gap-2 md:hidden">
              {logo}
              <span className="truncate text-sm font-semibold text-slate-900">{clinicName}</span>
            </Link>
            <p className="hidden min-w-[6rem] truncate text-[15px] font-semibold text-slate-900 md:block">{pageTitle}</p>

            {canSearch && (
              <form
                onSubmit={submitSearch}
                role="search"
                className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-400 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 md:flex"
              >
                <SearchIcon className="h-4 w-4 flex-none" />
                <input
                  ref={desktopSearchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search patients…")}
                  aria-label={t("Search patients")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                <kbd className="rounded border border-slate-300 px-1.5 font-mono text-[11px] text-slate-400">Ctrl K</kbd>
              </form>
            )}

            <div className="ml-auto flex items-center gap-1">
              {canSearch && (
                <button
                  type="button"
                  onClick={() => setSearchOpen((o) => !o)}
                  aria-label={t("Search patients")}
                  aria-expanded={searchOpen}
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              )}

              <div ref={avatarWrapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t("Account menu")}
                  className="flex items-center gap-1.5 rounded-full p-1 pr-1.5 hover:bg-slate-100"
                >
                  {avatar}
                  <ChevronIcon className="hidden h-4 w-4 text-slate-400 sm:block" />
                </button>
                {menuOpen && (
                  <div role="menu" className="animate-fade-in absolute right-0 top-11 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <div className="mb-1 border-b border-slate-100 px-2.5 pb-2.5 pt-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayName || email}</p>
                      <p className="truncate text-xs text-slate-400" title={email}>
                        {email}
                      </p>
                    </div>
                    <Link
                      role="menuitem"
                      href={MY_PROFILE_HREF}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <ProfileIcon className="h-[18px] w-[18px]" />
                      {t("My profile")}
                    </Link>
                    <Link
                      role="menuitem"
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <SlidersIcon className="h-[18px] w-[18px]" />
                      {t("My settings")}
                    </Link>
                    <form action={logout}>
                      <button
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <SignOutIcon className="h-[18px] w-[18px]" />
                        {t("Sign out")}
                      </button>
                    </form>
                    <div className="mt-1 border-t border-slate-100 pt-2">
                      <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t("Language")}</p>
                      <LanguageList />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {canSearch && searchOpen && (
            <form onSubmit={submitSearch} role="search" className="border-t border-slate-100 px-4 py-2 md:hidden">
              <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-400 focus-within:border-teal-500">
                <SearchIcon className="h-4 w-4 flex-none" />
                <input
                  ref={phoneSearchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search patients…")}
                  aria-label={t("Search patients")}
                  enterKeyHint="search"
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </form>
          )}
        </header>

        {children}
      </div>

      {/* phone: the More sheet, grouped like the sidebar */}
      {moreOpen && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/40 md:hidden print:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
      )}
      {moreOpen && (
        <div
          id="more-menu"
          role="dialog"
          aria-label={t("More pages")}
          className="animate-fade-in-up fixed inset-x-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-3 pt-4 shadow-xl md:hidden print:hidden"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          {moreGroups.map((group) => (
            <div key={group.label} className="pb-2">
              <p className="pl-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const badge = badgeOf(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center text-xs font-medium leading-tight ${
                        active ? "bg-teal-50 text-teal-700" : "text-slate-600 active:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      {item.label}
                      {badge && <BadgeDot tone={badge.tone} className="right-[calc(50%-20px)] top-2" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-3">
              {avatar}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={email}>
                {displayName || email}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Link href={MY_PROFILE_HREF} onClick={() => setMoreOpen(false)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 active:bg-slate-100">
                <ProfileIcon className="h-5 w-5" />
                {t("My profile")}
              </Link>
              <Link href="/settings" onClick={() => setMoreOpen(false)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 active:bg-slate-100">
                <SlidersIcon className="h-5 w-5" />
                {t("My settings")}
              </Link>
              <form action={logout}>
                <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 active:bg-slate-100">
                  <SignOutIcon className="h-5 w-5" />
                  {t("Sign out")}
                </button>
              </form>
            </div>
            <LanguageList className="mt-2 grid grid-cols-2 gap-2" />
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "content-box" }}
      >
        {barLinks.map((link) => {
          const active = isActive(pathname, link.href) && !moreOpen;
          const badge = badgeOf(link);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMoreOpen(false)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-teal-600" : "text-slate-500"}`}
            >
              <Icon className="h-6 w-6" />
              {link.label}
              {badge && <BadgeDot tone={badge.tone} className="left-[calc(50%+6px)] top-2.5" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            moreOpen || moreActive ? "text-teal-600" : "text-slate-500"
          }`}
        >
          <MoreIcon className="h-6 w-6" />
          {t("More")}
        </button>
      </nav>
    </>
  );
}
