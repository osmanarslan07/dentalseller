"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { setCelebrationSound } from "@/lib/privacy-actions";
import { useT } from "@/i18n/client";

const CelebrationSoundContext = createContext<{ enabled: boolean; toggle: () => void }>({
  enabled: true,
  toggle: () => {},
});

export function CelebrationSoundProvider({ children, initialEnabled }: { children: ReactNode; initialEnabled: boolean }) {
  // Seeded from the settings row (read server-side), same pattern as PrivacyProvider —
  // no post-mount flash of the wrong state.
  const [enabled, setEnabled] = useState(initialEnabled);

  function toggle() {
    setEnabled((prev) => {
      const next = !prev;
      setCelebrationSound(next).catch(() => setEnabled(prev));
      return next;
    });
  }

  return <CelebrationSoundContext.Provider value={{ enabled, toggle }}>{children}</CelebrationSoundContext.Provider>;
}

export function useCelebrationSound() {
  return useContext(CelebrationSoundContext);
}

export function CelebrationSoundToggle() {
  const { enabled, toggle } = useCelebrationSound();
  const t = useT();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={enabled}
        onChange={toggle}
        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
      />
      {t("Play a sound with payment/sale celebrations")}
    </label>
  );
}
