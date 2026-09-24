"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/lib/auth-actions";
import { Permission } from "@/types";

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PatientsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20c.6-3.4 3-5.3 5.5-5.3s4.9 1.9 5.5 5.3" strokeLinecap="round" />
      <path d="M15.5 6.2c1.4.3 2.5 1.6 2.5 3.1s-1.1 2.8-2.5 3.1" strokeLinecap="round" />
      <path d="M16.5 14.9c2 .5 3.5 2.2 4 5.1" strokeLinecap="round" />
    </svg>
  );
}

function QuotesIcon({ className = "" }: { className?: string }) {
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

function TeamIcon({ className = "" }: { className?: string }) {
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

/** Each page with what it takes to see it (null: everyone). */
const ALL_LINKS: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  needs: Permission[] | null;
}[] = [
  { href: "/", label: "Home", icon: HomeIcon, needs: null },
  { href: "/patients", label: "Patients", icon: PatientsIcon, needs: ["patients.view"] },
  { href: "/quotes", label: "Quotes", icon: QuotesIcon, needs: ["quotes.use"] },
  { href: "/tasks", label: "Tasks", icon: TasksIcon, needs: ["tasks.use"] },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon, needs: ["patients.view"] },
  { href: "/transfers", label: "Transfers", icon: TransfersIcon, needs: ["transfers.manage"] },
  { href: "/earnings", label: "Earnings", icon: EarningsIcon, needs: ["earnings.own"] },
  { href: "/accounting", label: "Accounting", icon: AccountingIcon, needs: ["accounting.view"] },
  { href: "/settings", label: "Settings", icon: SettingsIcon, needs: null },
  { href: "/team", label: "Team", icon: TeamIcon, needs: ["earnings.all", "activity.view"] },
];

/** The phone bar: the pages used most on the move. Everything else sits under "More". */
const MOBILE_BAR = ["/", "/patients", "/transfers", "/tasks"];
const MOBILE_BAR_SIZE = MOBILE_BAR.length;

/** A page is active on its own path and on anything under it (/patients/123 → Patients). */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h11m0 0-3.5-3.5M20 12l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Nav({
  email,
  displayName,
  permissions,
}: {
  email: string;
  displayName: string;
  permissions: Permission[];
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const LINKS = ALL_LINKS.filter((l) => !l.needs || l.needs.some((p) => permissions.includes(p)));
  // the usual four when allowed; a page someone can't see gives its place to the next one
  const barLinks = [
    ...MOBILE_BAR.map((href) => LINKS.find((l) => l.href === href)).filter((l) => !!l),
    ...LINKS.filter((l) => !MOBILE_BAR.includes(l.href)),
  ].slice(0, MOBILE_BAR_SIZE);
  const moreLinks = LINKS.filter((l) => !barLinks.includes(l));
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));

  // the panel covers the page: no scrolling behind it, Escape closes it
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
    const activeHref = [...linkRefs.current.keys()].find((href) => isActive(pathname, href));
    const el = activeHref ? linkRefs.current.get(activeHref) : undefined;
    const container = navRef.current;
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setIndicator({ left: elRect.left - containerRect.left, width: elRect.width });
    } else {
      setIndicator(null);
    }
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="DentalSeller" className="h-10 w-10" />
              <span className="hidden sm:inline">DentalSeller</span>
            </Link>

            <nav ref={navRef} className="relative hidden gap-1 md:flex">
              {indicator && (
                <span
                  className="absolute inset-y-0 rounded-lg bg-teal-50 transition-all duration-300 ease-out"
                  style={{ left: indicator.left, width: indicator.width }}
                />
              )}
              {LINKS.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    ref={(el) => {
                      if (el) linkRefs.current.set(link.href, el);
                    }}
                    className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "text-teal-700" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-slate-500" title={email}>
              {displayName}
            </span>
            <form action={logout}>
              <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>

          <span className="max-w-[45%] truncate text-sm text-slate-500 md:hidden" title={email}>
            {displayName}
          </span>
        </div>
      </header>

      {moreOpen && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/40 md:hidden print:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
      )}
      {moreOpen && (
        <div
          id="more-menu"
          role="dialog"
          aria-label="More pages"
          className="animate-fade-in-up fixed inset-x-0 z-50 rounded-t-2xl bg-white px-4 pb-3 pt-4 shadow-xl md:hidden print:hidden"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <div className="grid grid-cols-3 gap-2">
            {moreLinks.map((link) => {
              const active = isActive(pathname, link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium ${
                    active ? "bg-teal-50 text-teal-700" : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <span className="min-w-0 truncate text-sm text-slate-500" title={email}>
              {displayName || email}
            </span>
            <form action={logout}>
              <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 active:bg-slate-100">
                <SignOutIcon className="h-5 w-5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "content-box" }}
      >
        {barLinks.map((link) => {
          const active = isActive(pathname, link.href) && !moreOpen;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-teal-600" : "text-slate-500"}`}
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
          More
        </button>
      </nav>
    </>
  );
}
