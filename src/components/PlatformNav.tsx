"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";

const LINKS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/clinics/new", label: "New clinic" },
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
          <span className="hidden text-right text-sm leading-tight lg:block">
            <span className="block font-medium text-slate-900">{displayName || "Superadmin"}</span>
            <span className="block text-xs text-slate-500">{email}</span>
          </span>
          <form action={logout}>
            <button
              type="submit"
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
