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
import { deleteQuote, convertQuoteToPatient } from "./actions";

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
    return list;
  }, [quotes, search, statusFilter]);

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
        {rows.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            defaultCurrency={defaultCurrency}
            deleting={deletingId === quote.id}
            converting={convertingId === quote.id}
            onEdit={() => {
              setEditingQuote(quote);
              setModalOpen(true);
            }}
            onDelete={() => handleDelete(quote.id)}
            onConvert={() => handleConvert(quote.id)}
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
              {rows.map((quote) => {
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
                    <td className="py-3 pl-4 pr-4 font-medium text-slate-800">{quote.name}</td>
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
  defaultCurrency,
  deleting,
  converting,
  onEdit,
  onDelete,
  onConvert,
}: {
  quote: Quote;
  defaultCurrency: string;
  deleting: boolean;
  converting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
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
          <div className="font-medium text-slate-800">{quote.name}</div>
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
