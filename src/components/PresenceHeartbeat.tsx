"use client";

import { useEffect } from "react";
import { heartbeat } from "@/lib/presence-actions";

const INTERVAL_MS = 60_000;

/** Keeps the user's last_seen_at fresh while the app is actually open in front of them —
 * pauses in a hidden/background tab, pings again the moment it's brought back. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    ping();
    const id = setInterval(ping, INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
