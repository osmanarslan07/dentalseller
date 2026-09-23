"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Quote, QuoteStatus } from "@/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCelebrationSound } from "@/components/celebration-sound";
import { fireConfetti, playChime } from "@/lib/celebrate";
import { QuoteFormModal } from "./QuoteFormModal";
import { QuoteCompareModal } from "./QuoteCompareModal";
import { deleteQuote, convertQuoteToPatient, duplicateQuote } from "./actions";

const groupKey = (quote: Quote) => quote.name.trim().toLowerCase();

/** Search matches more than just the exact name spelling — a seller is just as likely to
 * remember the label, the Komo reference, or a note they typed in. `q` is already
 * lowercased and trimmed. */
function matchesSearch(quote: Quote, q: string): boolean {
  const haystacks = [quote.name, quote.label, quote.komo_reference, quote.notes];
  return haystacks.some((h) => h?.toLowerCase().includes(q));
}

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

const STATUS_ORDER = Object.keys(STATUS_LABELS) as QuoteStatus[];

type SortKey = "created" | "name" | "status" | "total";

const SORT_LABELS: Record<SortKey, string> = {
  created: "Created",
  name: "Name",
  status: "Status",
  total: "Total",
};

// text/status columns read best A→Z first; numeric/date columns read best highest/newest first
const DEFAULT_SORT_DIR: Record<SortKey, "asc" | "desc"> = {
  created: "desc",
  name: "asc",
  status: "asc",
  total: "desc",
};

export function QuotesClient({ quotes, defaultCurrency }: { quotes: Quote[]; defaultCurrency: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [compareKey, setCompareKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();
  const { enabled: soundEnabled } = useCelebrationSound();
  const router = useRouter();

  function selectSort(key: SortKey) {
    setSortKey(key);
    setSortDir(DEFAULT_SORT_DIR[key]);
  }

  function handleHeaderSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      selectSort(key);
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const rows = useMemo(() => {
    let list = quotes;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((quote) => matchesSearch(quote, q));
    }
    if (statusFilter !== "all") {
      list = list.filter((quote) => quote.status === statusFilter);
    }

    // group quotes that share a name so alternatives for the same patient sit together;
    // each group keeps the source list's newest-first order internally
    const groups = new Map<string, Quote[]>();
    for (const quote of list) {
      const key = groupKey(quote);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(quote);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const groupList = [...groups.entries()].map(([key, group]) => ({ key, group, representative: group[0] }));
    groupList.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.representative.name.localeCompare(b.representative.name);
        case "status":
          return (
            dir *
            (STATUS_ORDER.indexOf(a.representative.status) - STATUS_ORDER.indexOf(b.representative.status))
          );
        case "total": {
          const at = a.representative.total_price ?? -Infinity;
          const bt = b.representative.total_price ?? -Infinity;
          return dir * (at - bt);
        }
        case "created":
        default:
          return (
            dir *
            (new Date(a.representative.created_at).getTime() - new Date(b.representative.created_at).getTime())
          );
      }
    });

    return groupList.flatMap(({ key, group }) => {
      const isExpanded = group.length <= 1 || expandedGroups.has(key);
      const visible = isExpanded ? group : group.slice(0, 1);
      return visible.map((quote, i) => ({
        quote,
        groupKeyValue: key,
        groupCount: group.length,
        isGroupStart: i === 0,
        isExpanded,
      }));
    });
  }, [quotes, search, statusFilter, sortKey, sortDir, expandedGroups]);

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
        const { patientId, celebration } = await convertQuoteToPatient(id);
        fireConfetti();
        if (soundEnabled) playChime();
        showToast(`${celebration.message} Fill in travel details.`);
        router.push(`/patients/${patientId}`);
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
            placeholder="Search name, label, Komo ref…"
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
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select
              value={sortKey}
              onChange={(e) => selectSort(e.target.value as SortKey)}
              className="sm:max-w-[160px]"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  Sort: {SORT_LABELS[k]}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:hidden">
        {rows.map(({ quote, groupCount, isGroupStart, isExpanded, groupKeyValue }) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            groupCount={groupCount}
            showCompare={isGroupStart && groupCount > 1}
            showToggle={isGroupStart && groupCount > 1}
            isExpanded={isExpanded}
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
            onToggle={() => toggleGroup(groupKeyValue)}
          />
        ))}
        {rows.length === 0 && <div className="py-10 text-center text-slate-400">No quotes match your filters.</div>}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="py-3 pl-4 pr-4">
                  <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleHeaderSort} />
                </th>
                <th className="py-3 pr-4">
                  <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleHeaderSort} />
                </th>
                <th className="py-3 pr-4">
                  <SortHeader label="Total" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={handleHeaderSort} />
                </th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-slate-400">Split</th>
                <th className="py-3 pr-4">
                  <SortHeader label="Created" sortKey="created" activeKey={sortKey} dir={sortDir} onSort={handleHeaderSort} />
                </th>
                <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ quote, groupCount, isGroupStart, isExpanded, groupKeyValue }) => {
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
                        {isGroupStart && groupCount > 1 && (
                          <button
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(groupKeyValue);
                            }}
                          >
                            {isExpanded ? "▾" : "▸"} {groupCount} quotes
                          </button>
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

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-slate-600 ${
        active ? "text-slate-600" : "text-slate-400"
      }`}
    >
      {label} {active && (dir === "asc" ? "↑" : "↓")}
    </button>
  );
}

function QuoteCard({
  quote,
  groupCount,
  showCompare,
  showToggle,
  isExpanded,
  defaultCurrency,
  deleting,
  converting,
  duplicating,
  onEdit,
  onDelete,
  onConvert,
  onDuplicate,
  onCompare,
  onToggle,
}: {
  quote: Quote;
  groupCount: number;
  showCompare: boolean;
  showToggle: boolean;
  isExpanded: boolean;
  defaultCurrency: string;
  deleting: boolean;
  converting: boolean;
  duplicating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onDuplicate: () => void;
  onCompare: () => void;
  onToggle: () => void;
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
            {showToggle && (
              <button
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
              >
                {isExpanded ? "▾" : "▸"} {groupCount} quotes
              </button>
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
