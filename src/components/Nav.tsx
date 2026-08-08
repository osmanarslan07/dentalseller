"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/auth-actions";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/patients", label: "Patients" },
  { href: "/projections", label: "Projections" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Dental Commission Tracker" className="h-12 w-12" />
            <span className="hidden sm:inline">Dental Commission Tracker</span>
          </Link>

          <nav className="hidden gap-1 md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <span className="text-sm text-slate-500">{email}</span>
          <form action={logout}>
            <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /> : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">{email}</span>
            <form action={logout}>
              <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
