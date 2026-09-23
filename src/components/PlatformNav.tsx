"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";

const LINKS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/clinics/new", label: "New clinic" },
  { href: "/platform/people", label: "People" },
  { href: "/platform/announcements", label: "Announcements" },
  { href: "/platform/superadmins", label: "Superadmins" },
  { href: "/platform/audit", label: "Audit log" },
  { href: "/platform/status", label: "Status" },
];

/** Deliberately separate from Nav.tsx — the superadmin link set shares nothing with the
 * seller/admin one, and "platform" is never called "admin" so it can't be confused with a
 * clinic's own admin role. */
export function PlatformNav({ email, displayName }: { email: string; displayName: string | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/platform" className="flex items-center gap-2 font-semibold text-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="DentalSeller" className="h-10 w-10" />
            <span className="hidden sm:inline">DentalSeller</span>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
              Platform
            </span>
          </Link>

          <nav className="flex gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/platform"
                  ? pathname === "/platform" || (pathname.startsWith("/platform/clinics/") && pathname !== "/platform/clinics/new")
                  : pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* plain GET form: works before hydration, and lands on /platform/people?q=… */}
          <form action="/platform/people" role="search" className="hidden md:block">
            <input
              type="search"
              name="q"
              placeholder="Find a person…"
              aria-label="Find a person"
              className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:w-52 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
            />
          </form>
          <form action={logout}>
            <button
              type="submit"
              // the header is too full for a name/email block; who you are is one hover away
              title={`Signed in as ${displayName ? `${displayName} (${email})` : email}`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
