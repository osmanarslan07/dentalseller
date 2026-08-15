"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";

/** Pulses briefly when `status` changes from its previous value — silent on first mount. */
export function StatusBadge({ status }: { status: "upcoming" | "completed" }) {
  const prevRef = useRef(status);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prevRef.current !== status) {
      prevRef.current = status;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 500);
      return () => clearTimeout(t);
    }
  }, [status]);

  return (
    <span className={`inline-block ${pulse ? "animate-status-pulse" : ""}`}>
      {status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="amber">Upcoming</Badge>}
    </span>
  );
}
