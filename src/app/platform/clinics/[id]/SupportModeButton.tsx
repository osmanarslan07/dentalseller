"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { startSupportSession } from "@/lib/support-actions";

/** Enters the clinic's app as DentalSeller support — view-only until editing is unlocked
 * from the support bar. Invisible to the clinic; recorded in the support log. */
export function SupportModeButton({ clinicId }: { clinicId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await startSupportSession(clinicId);
            } catch (err) {
              if (err instanceof Error && /NEXT_REDIRECT/.test(err.message)) throw err;
              setError(err instanceof Error ? err.message : "Couldn't open support mode");
            }
          })
        }
      >
        {pending ? "Opening…" : "Open in support mode"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
