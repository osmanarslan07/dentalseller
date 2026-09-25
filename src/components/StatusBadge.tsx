"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { useT } from "@/i18n/client";

/** Pulses briefly when `status` changes from its previous value — silent on first mount. */
export function StatusBadge({ status }: { status: "upcoming" | "completed" }) {
  const prevRef = useRef(status);
  const [pulse, setPulse] = useState(false);
  const tr = useT();

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
      {status === "completed" ? <Badge tone="green">{tr("Completed")}</Badge> : <Badge tone="amber">{tr("Upcoming")}</Badge>}
    </span>
  );
}
