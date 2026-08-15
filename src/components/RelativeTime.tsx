"use client";

import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

function relativeLabel(fromMs: number, nowMs: number): string {
  const diffSec = Math.round((fromMs - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 10) return "just now";
  if (abs < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  return rtf.format(diffHour, "hour");
}

/** Ticking "updated Xm ago" label — re-renders every 15s to stay current. */
export function RelativeTime({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  return <>{relativeLabel(timestamp, Date.now())}</>;
}
