"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Quote, QuoteStatus } from "@/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { QuoteFormModal } from "./QuoteFormModal";
import { QuoteCompareModal } from "./QuoteCompareModal";
import { deleteQuote, convertQuoteToPatient, duplicateQuote } from "./actions";

const groupKey = (quote: Quote) => quote.name.trim().toLowerCase();

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

export function QuotesClient({ quotes, defaultCurrency }: { quotes: Quote[]; defaultCurrency: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [compareKey, setCompareKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  const rows = useMemo(() => {
    let list = quotes;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((quote) => quote.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((quote) => quote.status === statusFilter);
    }

    // group quotes that share a name so alternatives for the same patient sit together,
    // newest group first (source list is already newest-first) and stable within a group
    const groupOrder = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    for (const quote of list) {
      const key = groupKey(quote);
      if (!groupOrder.has(key)) groupOrder.set(key, groupOrder.size);
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }
    const sorted = [...list].sort((a, b) => groupOrder.get(groupKey(a))! - groupOrder.get(groupKey(b))!);

    return sorted.map((quote, i) => {
      const key = groupKey(quote);
      const isGroupStart = i === 0 || groupKey(sorted[i - 1]) !== key;
      return { quote, groupCount: groupCounts.get(key)!, isGroupStart };
    });
  }, [quotes, search, statusFilter]);

  const compareQuotes = useMemo(
    () => (compareKey ? quotes.filter((quote) => groupKey(quote) === compareKey) : []),
    [quotes, compareKey]
  );

  function handleDelete(id: string) {
    if (!confirm("Delete this quote? This cannot be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteQuote(id);
        showToast("Quote deleted");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete quote", "error");
      } finally {
        setDeletingId(null);
      }
    });
  }

  function handleDuplicate(id: string) {
    setDuplicatingId(id);
    startTransition(async () => {
      try {
        await duplicateQuote(id);
        showToast("Quote duplicated ✓");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to duplicate quote", "error");
      } finally {
        setDuplicatingId(null);
      }
    });
  }

  function handleConvert(id: string) {
    if (!confirm("Convert this quote into a confirmed patient?")) return;
    setConvertingId(id);
    startTransition(async () => {
      try {
        await convertQuoteToPatient(id);
        showToast("Converted to patient ✓ — fill in travel details on the Patients page");
        router.push(`/patients`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to convert quote", "error");
      } finally {
        setConvertingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
          <p className="mt-1 text-sm text-slate-500">Draft offers for patients who aren&apos;t confirmed yet</p>
        </div>
        <Button
          onClick={() => {
            setEditingQuote(null);
            setModalOpen(true);
          }}
        >
          + New quote
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | "all")}
            className="sm:max-w-[180px]"
          >
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="grid gap-3 md:hidden">
        {rows.map(({ quote, groupCount, isGroupStart }) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            groupCount={groupCount}
            showCompare={isGroupStart && groupCount > 1}
            defaultCurrency={defaultCurrency}
            deleting={deletingId === quote.id}
            converting={convertingId === quote.id}
            duplicating={duplicatingId === quote.id}
            onEdit={() => {
              setEditingQuote(quote);
              setModalOpen(true);
            }}
            onDelete={() => handleDelete(quote.id)}
            onConvert={() => handleConvert(quote.id)}
            onDuplicate={() => handleDuplicate(quote.id)}
            onCompare={() => setCompareKey(groupKey(quote))}
          />
        ))}
        {rows.length === 0 && <div className="py-10 text-center text-slate-400">No quotes match your filters.</div>}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pl-4 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Total</th>
                <th className="pb-2 pr-4 font-medium">Split</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ quote, groupCount, isGroupStart }) => {
                const { first, second } = computeQuoteSplit(
                  quote.total_price,
                  quote.split_mode,
                  quote.deposit_percent,
                  quote.first_visit_amount
                );
                return (
                  <tr
                    key={quote.id}
                    className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                    onClick={() => {
                      setEditingQuote(quote);
                      setModalOpen(true);
                    }}
                  >
                    <td className="py-3 pl-4 pr-4 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        {quote.name}
                        {quote.label && <span className="text-xs font-normal text-slate-400">{quote.label}</span>}
                        {groupCount > 1 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            {groupCount} quotes
                          </span>
                        )}
                        {isGroupStart && groupCount > 1 && (
                          <button
                            className="text-[11px] font-medium text-teal-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompareKey(groupKey(quote));
                            }}
                          >
                            Compare
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={STATUS_TONES[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-700">
                      {quote.total_price != null ? formatCurrency(quote.total_price, quote.currency) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-500">
                      {first != null && second != null
                        ? `${formatCurrency(first, quote.currency)} + ${formatCurrency(second, quote.currency)}`
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(quote.created_at.slice(0, 10))}</td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/quotes/${quote.id}/offer`}
                          target="_blank"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                        >
                          Offer
                        </Link>
                        {!quote.converted_patient_id && (
                          <button
                            disabled={convertingId === quote.id}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                            onClick={() => handleConvert(quote.id)}
                          >
                            Convert
                          </button>
                        )}
                        <button
                          disabled={duplicatingId === quote.id}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                          onClick={() => handleDuplicate(quote.id)}
                        >
                          Duplicate
                        </button>
                        <button
                          disabled={deletingId === quote.id}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => handleDelete(quote.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No quotes match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <QuoteCompareModal open={!!compareKey} onClose={() => setCompareKey(null)} quotes={compareQuotes} />

      <QuoteFormModal
        key={modalOpen ? editingQuote?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        quote={editingQuote}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}

function QuoteCard({
  quote,
  groupCount,
  showCompare,
  defaultCurrency,
  deleting,
  converting,
  duplicating,
  onEdit,
  onDelete,
  onConvert,
  onDuplicate,
  onCompare,
}: {
  quote: Quote;
  groupCount: number;
  showCompare: boolean;
  defaultCurrency: string;
  deleting: boolean;
  converting: boolean;
  duplicating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onDuplicate: () => void;
  onCompare: () => void;
}) {
  const { first, second } = computeQuoteSplit(
    quote.total_price,
    quote.split_mode,
    quote.deposit_percent,
    quote.first_visit_amount
  );
  return (
    <Card className="cursor-pointer p-4" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium text-slate-800">
            {quote.name}
            {quote.label && <span className="text-xs font-normal text-slate-400">{quote.label}</span>}
            {groupCount > 1 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {groupCount} quotes
              </span>
            )}
            {showCompare && (
              <button
                className="text-[11px] font-medium text-teal-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onCompare();
                }}
              >
                Compare
              </button>
            )}
          </div>
          <div className="text-sm text-slate-500">
            {quote.total_price != null ? formatCurrency(quote.total_price, quote.currency || defaultCurrency) : "—"}
          </div>
        </div>
        <Badge tone={STATUS_TONES[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
      </div>
      {first != null && second != null && (
        <div className="mt-2 text-xs text-slate-400">
          {formatCurrency(first, quote.currency)} + {formatCurrency(second, quote.currency)}
        </div>
      )}
      <div
        className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/quotes/${quote.id}/offer`}
          target="_blank"
          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
        >
          Offer
        </Link>
        {!quote.converted_patient_id && (
          <button
            disabled={converting}
            className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            onClick={onConvert}
          >
            Convert
          </button>
        )}
        <button
          disabled={duplicating}
          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          onClick={onDuplicate}
        >
          Duplicate
        </button>
        <button
          disabled={deleting}
          className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </Card>
  );
}
