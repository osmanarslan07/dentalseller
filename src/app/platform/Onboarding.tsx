"use client";

import { useT } from "@/i18n/client";
import { OnboardingStep, onboardingProgress } from "@/lib/clinic-onboarding";
import { Card } from "@/components/ui";

/** Compact tag for the clinics table — renders nothing once setup is complete. */
export function OnboardingTag({ steps }: { steps: OnboardingStep[] }) {
  const { done, total, complete } = onboardingProgress(steps);
  const t = useT();
  if (complete) return null;
  return (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
      {t("Setup {done}/{total}", { done, total })}
    </span>
  );
}

export function OnboardingCard({ steps }: { steps: OnboardingStep[] }) {
  const { done, total, complete } = onboardingProgress(steps);
  const pct = Math.round((done / total) * 100);
  const t = useT();

  // Once a clinic is fully set up the checklist is just noise on every visit.
  if (complete) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {t("Setup complete: all {n} onboarding steps done.", { n: total })}
      </p>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t("Setup")}</h2>
        <span className="text-sm font-medium text-slate-500">
          {t("{done} of {total} done", { done, total })}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                step.done ? "bg-emerald-100 text-emerald-700" : "border border-slate-300 text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${step.done ? "text-slate-500" : "font-medium text-slate-900"}`}>{t(step.label)}</p>
              {!step.done && <p className="mt-0.5 text-xs text-slate-500">{t(step.hint)}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
