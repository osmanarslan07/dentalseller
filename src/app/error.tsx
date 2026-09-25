"use client";
import { useT } from "@/i18n/client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{t("Something went wrong")}</h1>
      <p className="max-w-sm text-sm text-slate-500">
        {t("A temporary error occurred loading this page. This usually clears up on its own.")}
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        {t("Try again")}
      </button>
    </div>
  );
}
