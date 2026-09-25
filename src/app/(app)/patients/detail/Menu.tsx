"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect?: () => void;
  /** Opens in a new tab. */
  href?: string;
  danger?: boolean;
  /** A line above this item — used to set a destructive action apart. */
  divider?: boolean;
  disabled?: boolean;
}

export function KebabIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** A dropdown that closes on any click outside it, on Escape, or once an item is picked. It opens
 * upward when there isn't room for it below the button (e.g. the last row near the bottom of the
 * page), so no item ever sits below the end of the page. */
export function Menu({
  trigger,
  ariaLabel,
  heading,
  items,
  buttonClassName = "rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200",
  align = "right",
  disabled = false,
}: {
  trigger: ReactNode;
  ariaLabel?: string;
  heading?: string;
  items: MenuItem[];
  buttonClassName?: string;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Measured before paint, so the menu never flashes in the wrong place.
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const button = ref.current.getBoundingClientRect();
    const height = menuRef.current.offsetHeight + 6;
    const below = window.innerHeight - button.bottom;
    const above = button.top;
    setUpward(below < height && above > below);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = (i: MenuItem) =>
    `flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${
      i.danger ? "text-red-700" : "text-slate-900"
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 disabled:opacity-50 ${buttonClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${upward ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          {heading && (
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</p>
          )}
          {items.length === 0 && <p className="px-2.5 py-2 text-sm text-slate-400">Nothing here yet</p>}
          {items.map((i, n) => (
            <div key={n}>
              {i.divider && <div className="my-1 border-t border-slate-100" />}
              {i.href && !i.disabled ? (
                <Link
                  href={i.href}
                  target="_blank"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={itemClass(i)}
                >
                  <span>{i.label}</span>
                  {i.hint && <span className="text-xs font-normal text-slate-500">{i.hint}</span>}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={i.disabled}
                  onClick={() => {
                    setOpen(false);
                    i.onSelect?.();
                  }}
                  className={itemClass(i)}
                >
                  <span>{i.label}</span>
                  {i.hint && <span className="text-xs font-normal text-slate-500">{i.hint}</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The small ⋯ button on a row (extra, payment, transfer). */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <Menu
      trigger={<KebabIcon size={16} />}
      ariaLabel={label}
      items={items}
      buttonClassName="rounded-lg bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
    />
  );
}
