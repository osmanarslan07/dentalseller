"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Quote, QuoteStatus } from "@/types";
import { formatCurrency } from "@/lib/format";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { Badge } from "@/components/ui";

const STATUS_TONES: Record<QuoteStatus, "slate" | "green" | "amber" | "blue"> = {
  draft: "slate",
  sent: "amber",
  accepted: "green",
  declined: "blue",
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export function QuoteCompareModal({
  open,
  onClose,
  quotes,
}: {
  open: boolean;
  onClose: () => void;
  quotes: Quote[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Compare quotes {quotes[0] ? `— ${quotes[0].name}` : ""}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-auto p-6">
          <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-4">
            {quotes.map((quote) => {
              const { first, second } = computeQuoteSplit(
                quote.total_price,
                quote.split_mode,
                quote.deposit_percent,
                quote.first_visit_amount
              );
              const inclusions = (quote.inclusions || "")
                .split("\n")
                .map((s) => s.replace(/^-\s*/, "").trim())
                .filter(Boolean);

              return (
                <div key={quote.id} className="flex flex-col rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{quote.label || "Untitled option"}</div>
                    </div>
                    <Badge tone={STATUS_TONES[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
                  </div>

                  <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                    {quote.total_price != null ? formatCurrency(quote.total_price, quote.currency) : "—"}
                  </div>

                  {first != null && second != null && (
                    <div className="mt-1 text-xs text-slate-500">
                      {formatCurrency(first, quote.currency)} first visit + {formatCurrency(second, quote.currency)}{" "}
                      second visit
                    </div>
                  )}

                  {inclusions.length > 0 && (
                    <ul className="mt-4 space-y-1 text-sm text-slate-700">
                      {inclusions.map((item, i) => (
                        <li key={i} className="flex items-baseline gap-2">
                          <span className="text-teal-600">–</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto pt-4">
                    <Link
                      href={`/quotes/${quote.id}/offer`}
                      target="_blank"
                      className="inline-block rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-100"
                    >
                      Open / Print offer
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
