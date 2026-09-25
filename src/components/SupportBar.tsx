"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SupportContext } from "@/lib/viewer";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  endSupportSession,
  extendSupportSession,
  lockSupportEditing,
  logSupportPageView,
  setSupportViewAs,
  unlockSupportEditing,
} from "@/lib/support-actions";
import { roleLabel } from "@/types";
import { useLocale, useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

const time = (iso: string, locale: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

/** The superadmin's own control strip while inside a clinic. Never rendered for clinic users
 * (the layout only mounts it when the viewer has a support session). */
export function SupportBar({ support, viewAsId }: { support: SupportContext; viewAsId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();

  // Every page opened in support mode goes into the support access log — the path only,
  // never the query string (a search box's text could be a patient's name). The ref skips
  // a repeat of the page just logged, so the evidence log doesn't depend on React running
  // effects twice in development.
  const lastLoggedPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastLoggedPath.current === pathname) return;
    lastLoggedPath.current = pathname;
    logSupportPageView(pathname).catch(() => {
      // the log write is best-effort and the server already reports failures
    });
  }, [pathname]);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        // redirects (exit) surface as thrown errors in some runtimes — let those through
        if (err instanceof Error && /NEXT_REDIRECT/.test(err.message)) throw err;
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const editing = support.canWrite;

  return (
    <>
      <div className={`border-b text-sm ${editing ? "border-amber-300 bg-amber-100 text-amber-950" : "border-slate-700 bg-slate-900 text-white"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <span className="font-semibold">{t("Support mode")} · {support.clinicName}</span>

          <label className="flex items-center gap-2">
            <span className={editing ? "text-amber-800" : "text-slate-300"}>{t("Viewing as")}</span>
            <select
              value={viewAsId}
              disabled={pending || support.members.length === 0}
              onChange={(e) => run(() => setSupportViewAs(e.target.value))}
              className="rounded-md border-0 bg-white/90 px-2 py-1 text-sm text-slate-900"
            >
              {support.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.roles.map((r) => t(roleLabel(r))).join(", ") || m.role})
                </option>
              ))}
            </select>
          </label>

          <span className={editing ? "font-medium" : "text-slate-300"}>
            {editing ? t("Editing unlocked until {time}", { time: time(support.editingUntil!, locale) }) : t("View only")}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(lockSupportEditing)}>
                {t("Lock editing")}
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
                {t("Unlock editing")}
              </Button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(extendSupportSession)}
              className={`text-xs underline-offset-2 hover:underline ${editing ? "text-amber-800" : "text-slate-300"}`}
              title={t("Keep this session open for another 2 hours")}
            >
              {t("Session ends {time} · extend", { time: time(support.expiresAt, locale) })}
            </button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(endSupportSession)} className={editing ? "" : "text-white hover:bg-white/10"}>
              {t("Exit")}
            </Button>
          </div>
        </div>
        {error && <p className="mx-auto max-w-7xl px-4 pb-2 text-xs text-red-300 sm:px-6 lg:px-8">{error}</p>}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("Make changes to this clinic?")}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {rich(t("You're about to make changes in {clinic} as DentalSeller support. Every change is logged and shows in the clinic's history as {support}."), {
              clinic: <strong>{support.clinicName}</strong>,
              support: <strong>{t("DentalSeller support")}</strong>,
            })}
          </p>
          <p className="text-sm text-slate-600">{t("Editing stays unlocked for 30 minutes, or until you lock it.")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmOpen(false);
                run(unlockSupportEditing);
              }}
            >
              {t("Unlock editing")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
