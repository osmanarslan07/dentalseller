"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";
import { EarningsChart } from "@/components/EarningsChart";
import { tierLabel } from "@/lib/commission";
import { CommissionSettings } from "@/types";
import { setHideEarnings } from "@/lib/privacy-actions";

const PrivacyContext = createContext<{
  hidden: boolean;
  toggle: () => void;
  showTry: boolean;
  tryRate: number | null;
}>({
  hidden: false,
  toggle: () => {},
  showTry: false,
  tryRate: null,
});

export function PrivacyProvider({
  children,
  initialHidden,
  showTry,
  tryRate,
}: {
  children: ReactNode;
  initialHidden: boolean;
  showTry: boolean;
  tryRate: number | null;
}) {
  // Seeded from the settings row (read server-side) so the very first render — server and
  // client — already reflects the saved state. No post-mount flash of real numbers.
  const [hidden, setHidden] = useState(initialHidden);

  function toggle() {
    setHidden((prev) => {
      const next = !prev;
      setHideEarnings(next).catch(() => setHidden(prev));
      return next;
    });
  }

  return (
    <PrivacyContext.Provider value={{ hidden, toggle, showTry, tryRate }}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

const MASK = "•••";

export function Money({
  value,
  currency,
  showConversion = true,
}: {
  value: number;
  currency: string;
  /** Set false in cramped spots (per-row table cells) to skip the secondary ≈ TRY line. */
  showConversion?: boolean;
}) {
  const { hidden, showTry, tryRate } = usePrivacy();
  if (hidden) return <>{MASK}</>;

  const primary = formatCurrency(value, currency);
  if (!showConversion || !showTry || !tryRate || currency === "TRY") return <>{primary}</>;

  return (
    <>
      {primary}
      <span className="block text-xs font-normal text-slate-400">
        ≈ {formatCurrency(value * tryRate, "TRY")}
      </span>
    </>
  );
}

export function Percent({ value }: { value: number }) {
  const { hidden } = usePrivacy();
  return <>{hidden ? MASK : formatPercent(value)}</>;
}

export function TierSublabel({ total, settings }: { total: number; settings: CommissionSettings }) {
  const { hidden } = usePrivacy();
  return <>{hidden ? MASK : tierLabel(total, settings)}</>;
}

export function PrivateEarningsChart(props: { data: { label: string; actual: number; expected: number }[]; currency: string }) {
  const { hidden } = usePrivacy();
  if (hidden) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
        Earnings chart hidden
      </div>
    );
  }
  return <EarningsChart {...props} />;
}

export function PrivacyToggleButton() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      title={hidden ? "Show earnings" : "Hide earnings"}
    >
      {hidden ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.4 9.4 0 0112 5c5 0 9 4 10 7-.5 1.6-1.6 3.3-3.2 4.7M6.5 6.5C4.6 7.8 3.1 9.7 2 12c1 3 5 7 10 7 1.2 0 2.4-.2 3.5-.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {hidden ? "Show earnings" : "Hide earnings"}
    </button>
  );
}
