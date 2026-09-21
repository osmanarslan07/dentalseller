"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

/** Keyed on pathname so React remounts (and replays the fade-in) on every route change,
 * instead of content just snapping into place. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in-up">
      {children}
    </div>
  );
}
