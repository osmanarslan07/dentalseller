"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/lib/auth-actions";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n";
import { LanguageList } from "@/components/LanguageSwitch";
import { Avatar } from "@/components/Avatar";
import { PIN_COOKIE } from "@/lib/nav-pin";
import {
  ActivityIcon,
  ChevronIcon,
  FOLD_DELAY_MS,
  HomeIcon,
  MoreIcon,
  OPEN_DELAY_MS,
  PatientsIcon,
  PinIcon,
  QuotesIcon,
  SearchIcon,
  SignOutIcon,
  TeamIcon,
  isActive,
} from "@/components/Nav";

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" strokeLinecap="round" />
    </svg>
  );
}

function MegaphoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 10v4a1 1 0 0 0 1 1h2.5l7 4V5l-7 4H5a1 1 0 0 0-1 1z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6l-7-2.5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Item = { href: string; label: string; icon: (props: { className?: string }) => ReactNode };

/** The menu, by group — the same rail as a clinic's, with the platform's own pages. */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: msg("Clinics"),
    items: [
      { href: "/platform", label: msg("Overview"), icon: HomeIcon },
      { href: "/platform/clinics/new", label: msg("New clinic"), icon: PlusIcon },
      { href: "/platform/people", label: msg("People"), icon: PatientsIcon },
    ],
  },
  {
    label: msg("Messages"),
    items: [{ href: "/platform/announcements", label: msg("Announcements"), icon: MegaphoneIcon }],
  },
  {
    label: msg("Access"),
    items: [
      { href: "/platform/roles", label: msg("Roles"), icon: ShieldIcon },
      { href: "/platform/superadmins", label: msg("Superadmins"), icon: TeamIcon },
    ],
  },
  {
    label: msg("System"),
    items: [
      { href: "/platform/audit", label: msg("Audit log"), icon: QuotesIcon },
      { href: "/platform/status", label: msg("Status"), icon: ActivityIcon },
    ],
  },
];

/** The phone bar: the pages used most; everything else sits under "More". */
const MOBILE_BAR = ["/platform", "/platform/clinics/new", "/platform/people", "/platform/announcements"];

/** Overview also covers a clinic's own page (/platform/clinics/<id>), but not "New clinic". */
function isActivePlatform(pathname: string, href: string): boolean {
  if (href === "/platform") {
    return pathname === "/platform" || (pathname.startsWith("/platform/clinics/") && pathname !== "/platform/clinics/new");
  }
  return isActive(pathname, href);
}

/** Deliberately separate from Nav.tsx — the superadmin link set shares nothing with the
 * seller/admin one, and "platform" is never called "admin" so it can't be confused with a
 * clinic's own admin role. It looks the same, though: the icon rail that opens on hover. */
export function PlatformShell({
  email,
  displayName,
  userId,
  initialPinned,
  children,
}: {
  email: string;
  displayName: string | null;
  userId: string;
  initialPinned: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();

  const [pinned, setPinned] = useState(initialPinned);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);
  const avatarWrapRef = useRef<HTMLDivElement>(null);

  const expanded = pinned || open;
  const who = displayName || email;

  const groups = GROUPS.map((g) => ({ ...g, label: t(g.label), items: g.items.map((i) => ({ ...i, label: t(i.label) })) }));
  const allItems = groups.flatMap((g) => g.items);
  const barLinks = MOBILE_BAR.map((href) => allItems.find((l) => l.href === href)).filter((l): l is Item => !!l);
  const moreGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !barLinks.includes(i)) }))
    .filter((g) => g.items.length > 0);
  const moreActive = moreGroups.some((g) => g.items.some((i) => isActivePlatform(pathname, i.href)));
  const pageTitle = allItems.find((i) => isActivePlatform(pathname, i.href))?.label ?? "";

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (foldTimer.current) clearTimeout(foldTimer.current);
    openTimer.current = foldTimer.current = null;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const openSoon = () => {
    clearTimers();
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

  const logo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" alt="" className="h-9 w-9 flex-none" />
  );
  const avatar = <Avatar name={who} />;

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
        <Link href="/platform" className="flex h-14 flex-none items-center gap-2.5 whitespace-nowrap border-b border-slate-200 pl-3.5 pr-3" title="DentalSeller">
          {logo}
          <span className={`flex min-w-0 items-center gap-2 transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>
            <span className="truncate text-sm font-semibold text-slate-900">DentalSeller</span>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">{t("Platform")}</span>
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
                const active = isActivePlatform(pathname, item.href);
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
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            {/* phone: who we are; desktop: where we are */}
            <Link href="/platform" className="flex min-w-0 items-center gap-2 md:hidden">
              {logo}
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">{t("Platform")}</span>
            </Link>
            <p className="hidden min-w-[6rem] truncate text-[15px] font-semibold text-slate-900 md:block">{pageTitle}</p>

            {/* plain GET form: works before hydration, and lands on /platform/people?q=… */}
            <form
              action="/platform/people"
              role="search"
              className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-400 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 md:flex"
            >
              <SearchIcon className="h-4 w-4 flex-none" />
              <input
                type="search"
                name="q"
                placeholder={t("Find a person…")}
                aria-label={t("Find a person")}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </form>

            <div className="ml-auto flex items-center gap-1">
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
                      <p className="truncate text-sm font-semibold text-slate-900">{who}</p>
                      <p className="truncate text-xs text-slate-400" title={email}>
                        {email}
                      </p>
                    </div>
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
                  const active = isActivePlatform(pathname, item.href);
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
                {who}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
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
          const active = isActivePlatform(pathname, link.href) && !moreOpen;
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
