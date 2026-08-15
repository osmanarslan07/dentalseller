"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Patient, CommissionSettings } from "@/types";
import {
  computeMonthlyAggregates,
  monthLabel,
  patientCommissionContribution,
  ratesMapFromAggregates,
} from "@/lib/commission";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { Money } from "@/components/privacy";
import { useToast } from "@/components/Toast";
import { PatientFormModal } from "./PatientFormModal";
import { deletePatient } from "./actions";

type SortKey = "name" | "confirmation_date" | "visit1_date" | "visit2_date" | "commission";
type ViewMode = "list" | "kanban";
type Stage = "confirmed" | "visit1_scheduled" | "visit1_completed" | "visit2_scheduled" | "done";

const STAGES: { id: Stage; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "visit1_scheduled", label: "Visit 1 scheduled" },
  { id: "visit1_completed", label: "Visit 1 completed" },
  { id: "visit2_scheduled", label: "Visit 2 scheduled" },
  { id: "done", label: "Done" },
];

const STAGE_TONES: Record<Stage, "slate" | "green" | "amber" | "blue"> = {
  confirmed: "slate",
  visit1_scheduled: "amber",
  visit1_completed: "blue",
  visit2_scheduled: "amber",
  done: "green",
};

/** Derived, not stored — recomputed from dates/status every render so it can never drift out of sync. */
function patientStage(p: Patient): Stage {
  if (!p.visit1_date) return "confirmed";
  if (p.visit1_status !== "completed") return "visit1_scheduled";
  if (!p.needs_visit2) return "done";
  if (p.visit2_status === "completed") return "done";
  if (p.visit2_date) return "visit2_scheduled";
  return "visit1_completed";
}

function SortHeader({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th
      className={`cursor-pointer select-none pb-2 pr-4 font-medium hover:text-slate-700 ${className}`}
      onClick={() => onSort(sortKeyValue)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyValue && <span className="text-teal-600">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function DocumentsMenu({
  patient: p,
  open,
  onToggle,
}: {
  patient: Patient;
  open: boolean;
  onToggle: () => void;
}) {
  const items = [
    p.confirmation_date && p.visit1_date
      ? { label: "Operations sheet · Visit 1", href: `/patients/${p.id}/document?visit=1` }
      : null,
    p.confirmation_date && p.visit2_date
      ? { label: "Operations sheet · Visit 2", href: `/patients/${p.id}/document?visit=2` }
      : null,
    p.visit1_arrival_flight_no
      ? { label: "Confirmation letter · Visit 1", href: `/patients/${p.id}/confirmation-letter?visit=1` }
      : null,
    p.visit2_arrival_flight_no
      ? { label: "Confirmation letter · Visit 2", href: `/patients/${p.id}/confirmation-letter?visit=2` }
      : null,
  ].filter((item): item is { label: string; href: string } => item != null);

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Documents"
        className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 ${
          open ? "bg-slate-100 text-slate-700" : ""
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M14 3v5h5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target="_blank"
              className="block px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-teal-600"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatientsClient({
  patients,
  settings,
  initialQuery,
}: {
  patients: Patient[];
  settings: CommissionSettings;
  initialQuery: string;
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState(initialQuery);
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [treatmentFilter, setTreatmentFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("confirmation_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Patient | null>(null);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openDocsId, setOpenDocsId] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!openDocsId) return;
    const close = () => setOpenDocsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openDocsId]);

  const aggregates = useMemo(() => computeMonthlyAggregates(patients, settings), [patients, settings]);
  const ratesMap = useMemo(() => ratesMapFromAggregates(aggregates), [aggregates]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) if (p.confirmation_date) set.add(p.confirmation_date.slice(0, 7));
    return [...set].sort().reverse();
  }, [patients]);

  const treatments = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) if (p.treatment) set.add(p.treatment);
    return [...set].sort();
  }, [patients]);

  const hotelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) {
      if (p.visit1_hotel_name) set.add(p.visit1_hotel_name);
      if (p.visit2_hotel_name) set.add(p.visit2_hotel_name);
    }
    return [...set].sort();
  }, [patients]);

  const roomTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) {
      if (p.visit1_room_type) set.add(p.visit1_room_type);
      if (p.visit2_room_type) set.add(p.visit2_room_type);
    }
    return [...set].sort();
  }, [patients]);

  const rows = useMemo(() => {
    let list = patients.map((p) => ({
      patient: p,
      commission: patientCommissionContribution(p, ratesMap),
      stage: patientStage(p),
    }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.patient.name.toLowerCase().includes(q));
    }
    if (stageFilter !== "all") {
      list = list.filter((r) => r.stage === stageFilter);
    }
    if (monthFilter !== "all") {
      list = list.filter((r) => r.patient.confirmation_date?.slice(0, 7) === monthFilter);
    }
    if (treatmentFilter !== "all") {
      list = list.filter((r) => r.patient.treatment === treatmentFilter);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.patient.name.localeCompare(b.patient.name);
      else if (sortKey === "commission")
        cmp = a.commission.actual + a.commission.expected - (b.commission.actual + b.commission.expected);
      else {
        const av = a.patient[sortKey] ?? "";
        const bv = b.patient[sortKey] ?? "";
        cmp = av.localeCompare(bv);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [patients, search, stageFilter, monthFilter, treatmentFilter, sortKey, sortDir, ratesMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this patient? This cannot be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deletePatient(id);
        showToast("Patient deleted");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete patient", "error");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="mt-1 text-sm text-slate-500">{patients.length} total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Kanban
            </button>
          </div>
          <Button
            onClick={() => {
              setEditingPatient(null);
              setModalOpen(true);
            }}
          >
            + Add patient
          </Button>
        </div>
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
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as Stage | "all")}
            className="sm:max-w-[180px]"
          >
            <option value="all">All stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="sm:max-w-[180px]"
          >
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
          <Select
            value={treatmentFilter}
            onChange={(e) => setTreatmentFilter(e.target.value)}
            className="sm:max-w-[180px]"
          >
            <option value="all">All treatments</option>
            {treatments.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {view === "kanban" && (
        <KanbanBoard
          rows={rows}
          settings={settings}
          onCardClick={(p) => {
            setEditingPatient(p);
            setDuplicateFrom(null);
            setModalOpen(true);
          }}
        />
      )}

      {view === "list" && (
      <div className="grid gap-3 md:hidden">
        {rows.map(({ patient: p, commission, stage }) => (
          <Card
            key={p.id}
            className="cursor-pointer p-4"
            onClick={() => {
              setEditingPatient(p);
              setDuplicateFrom(null);
              setModalOpen(true);
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-slate-800">{p.name}</div>
                <div className="text-sm text-slate-500">{p.treatment || "—"}</div>
              </div>
              <Badge tone={STAGE_TONES[stage]}>{STAGES.find((s) => s.id === stage)?.label}</Badge>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Confirmed</div>
                <div className="text-slate-600">{formatDate(p.confirmation_date)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Commission</div>
                <div className="font-medium text-slate-700">
                  <Money value={commission.actual} currency={settings.currency} showConversion={false} />
                  {commission.expected > 0 && (
                    <div className="text-xs font-normal text-slate-400">
                      +<Money value={commission.expected} currency={settings.currency} showConversion={false} /> expected
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Visit 1</div>
                <div className="text-slate-600">{formatDate(p.visit1_date)}</div>
                <div className="text-xs text-slate-400">
                  {p.visit1_actual != null
                    ? formatCurrency(p.visit1_actual, settings.currency)
                    : p.visit1_expected != null
                    ? `${formatCurrency(p.visit1_expected, settings.currency)} (exp.)`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Visit 2</div>
                <div className="text-slate-600">{formatDate(p.visit2_date)}</div>
                <div className="text-xs text-slate-400">
                  {p.visit2_actual != null
                    ? formatCurrency(p.visit2_actual, settings.currency)
                    : p.visit2_expected != null
                    ? `${formatCurrency(p.visit2_expected, settings.currency)} (exp.)`
                    : "—"}
                </div>
              </div>
            </div>

            <div
              className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) && (
                <a
                  href={p.komo_reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                >
                  Komo
                </a>
              )}
              <DocumentsMenu
                patient={p}
                open={openDocsId === p.id}
                onToggle={() => setOpenDocsId((cur) => (cur === p.id ? null : p.id))}
              />
              <button
                title="Duplicate — prefill a new patient from this one"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => {
                  setEditingPatient(null);
                  setDuplicateFrom(p);
                  setModalOpen(true);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M4 16V6a2 2 0 012-2h10" />
                </svg>
              </button>
              <button
                disabled={deletingId === p.id}
                className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                onClick={() => handleDelete(p.id)}
              >
                Delete
              </button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <div className="py-10 text-center text-slate-400">No patients match your filters.</div>
        )}
      </div>
      )}

      {view === "list" && (
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <SortHeader label="Name" sortKeyValue="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="pl-4" />
                <th className="pb-2 pr-4 font-medium">Treatment</th>
                <SortHeader label="Confirmed" sortKeyValue="confirmation_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Visit 1" sortKeyValue="visit1_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Visit 2" sortKeyValue="visit2_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-2 pr-4 font-medium">Stage</th>
                <SortHeader label="Commission" sortKeyValue="commission" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-2 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ patient: p, commission, stage }) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                  onClick={() => {
                    setEditingPatient(p);
                    setDuplicateFrom(null);
                    setModalOpen(true);
                  }}
                >
                  <td className="py-3 pl-4 pr-4 font-medium text-slate-800">{p.name}</td>
                  <td className="py-3 pr-4 text-slate-500">{p.treatment || "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-3 pr-4 text-slate-500">
                    <div>{formatDate(p.visit1_date)}</div>
                    <div className="text-xs">
                      {p.visit1_actual != null
                        ? formatCurrency(p.visit1_actual, settings.currency)
                        : p.visit1_expected != null
                        ? `${formatCurrency(p.visit1_expected, settings.currency)} (exp.)`
                        : "—"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    <div>{formatDate(p.visit2_date)}</div>
                    <div className="text-xs">
                      {p.visit2_actual != null
                        ? formatCurrency(p.visit2_actual, settings.currency)
                        : p.visit2_expected != null
                        ? `${formatCurrency(p.visit2_expected, settings.currency)} (exp.)`
                        : "—"}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STAGE_TONES[stage]}>{STAGES.find((s) => s.id === stage)?.label}</Badge>
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    <Money value={commission.actual} currency={settings.currency} showConversion={false} />
                    {commission.expected > 0 && (
                      <div className="text-xs font-normal text-slate-400">
                        +<Money value={commission.expected} currency={settings.currency} showConversion={false} /> expected
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {p.komo_reference && /^https?:\/\//i.test(p.komo_reference) && (
                        <a
                          href={p.komo_reference}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                        >
                          Komo
                        </a>
                      )}
                      <DocumentsMenu
                        patient={p}
                        open={openDocsId === p.id}
                        onToggle={() => setOpenDocsId((cur) => (cur === p.id ? null : p.id))}
                      />
                      <button
                        title="Duplicate — prefill a new patient from this one"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => {
                          setEditingPatient(null);
                          setDuplicateFrom(p);
                          setModalOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <rect x="8" y="8" width="12" height="12" rx="2" />
                          <path d="M4 16V6a2 2 0 012-2h10" />
                        </svg>
                      </button>
                      <button
                        disabled={deletingId === p.id}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No patients match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <PatientFormModal
        key={modalOpen ? editingPatient?.id ?? duplicateFrom?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        patient={editingPatient}
        duplicateFrom={duplicateFrom}
        hotelOptions={hotelOptions}
        roomTypeOptions={roomTypeOptions}
      />
    </div>
  );
}

function KanbanBoard({
  rows,
  settings,
  onCardClick,
}: {
  rows: { patient: Patient; commission: { actual: number; expected: number }; stage: Stage }[];
  settings: CommissionSettings;
  onCardClick: (p: Patient) => void;
}) {
  const columns = STAGES.map((stage) => ({
    ...stage,
    items: rows.filter((r) => r.stage === stage.id),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {columns.map((col) => (
        <div key={col.id} className="flex flex-col">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
            <span className="text-xs text-slate-400">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map(({ patient: p, commission }) => (
              <Card
                key={p.id}
                className="cursor-pointer p-3 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-teal-500/30"
                onClick={() => onCardClick(p)}
              >
                <p className="text-sm font-medium text-slate-800">{p.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{p.treatment || "—"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {col.id === "confirmed" && `Confirmed ${formatDate(p.confirmation_date)}`}
                  {col.id === "visit1_scheduled" && `Visit 1 · ${formatDate(p.visit1_date)}`}
                  {col.id === "visit1_completed" && `Visit 1 done · ${formatDate(p.visit1_date)}`}
                  {col.id === "visit2_scheduled" && `Visit 2 · ${formatDate(p.visit2_date)}`}
                  {col.id === "done" && `Last visit · ${formatDate(p.visit2_date ?? p.visit1_date)}`}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  <Money value={commission.actual + commission.expected} currency={settings.currency} showConversion={false} />
                </p>
              </Card>
            ))}
            {col.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">
                Empty
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
