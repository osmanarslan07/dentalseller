"use client";

import { useMemo, useState, useTransition } from "react";
import { Patient, CommissionSettings } from "@/types";
import {
  computeMonthlyAggregates,
  monthLabel,
  patientCommissionContribution,
  ratesMapFromAggregates,
} from "@/lib/commission";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { Button, Card, Input, Select, StatusBadge } from "@/components/ui";
import { PatientFormModal } from "./PatientFormModal";
import { deletePatient } from "./actions";

type SortKey = "name" | "confirmation_date" | "visit1_date" | "visit2_date" | "commission";
type StatusFilter = "all" | "upcoming" | "completed";

function SortHeader({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className="cursor-pointer select-none pb-2 pr-4 font-medium hover:text-slate-700"
      onClick={() => onSort(sortKeyValue)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyValue && <span className="text-teal-600">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function patientOverallStatus(p: Patient): "upcoming" | "completed" {
  const visits = [
    { date: p.visit1_date, status: p.visit1_status },
    { date: p.visit2_date, status: p.visit2_status },
  ].filter((v) => v.date);
  if (visits.length === 0) return "upcoming";
  return visits.every((v) => v.status === "completed") ? "completed" : "upcoming";
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
  const [search, setSearch] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("confirmation_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const aggregates = useMemo(() => computeMonthlyAggregates(patients, settings), [patients, settings]);
  const ratesMap = useMemo(() => ratesMapFromAggregates(aggregates), [aggregates]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) if (p.confirmation_date) set.add(p.confirmation_date.slice(0, 7));
    return [...set].sort().reverse();
  }, [patients]);

  const rows = useMemo(() => {
    let list = patients.map((p) => ({
      patient: p,
      commission: patientCommissionContribution(p, ratesMap),
      status: patientOverallStatus(p),
    }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.patient.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (monthFilter !== "all") {
      list = list.filter((r) => r.patient.confirmation_date?.slice(0, 7) === monthFilter);
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
  }, [patients, search, statusFilter, monthFilter, sortKey, sortDir, ratesMap]);

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
        <Button
          onClick={() => {
            setEditingPatient(null);
            setModalOpen(true);
          }}
        >
          + Add patient
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
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="sm:max-w-[160px]"
          >
            <option value="all">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
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
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <SortHeader label="Name" sortKeyValue="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-2 pr-4 font-medium">Treatment</th>
                <SortHeader label="Confirmed" sortKeyValue="confirmation_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Visit 1" sortKeyValue="visit1_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Visit 2" sortKeyValue="visit2_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-2 pr-4 font-medium">Status</th>
                <SortHeader label="Commission" sortKeyValue="commission" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-2 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ patient: p, commission, status }) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="py-3 pr-4 font-medium text-slate-800">{p.name}</td>
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
                    <StatusBadge status={status} />
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    {formatCurrency(commission.actual, settings.currency)}
                    {commission.expected > 0 && (
                      <div className="text-xs font-normal text-slate-400">
                        +{formatCurrency(commission.expected, settings.currency)} expected
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end gap-2">
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
                      {p.confirmation_date && p.visit1_date && (
                        <Link
                          href={`/patients/${p.id}/document?visit=1`}
                          target="_blank"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                        >
                          Doc V1
                        </Link>
                      )}
                      {p.confirmation_date && p.visit2_date && (
                        <Link
                          href={`/patients/${p.id}/document?visit=2`}
                          target="_blank"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                        >
                          Doc V2
                        </Link>
                      )}
                      <button
                        className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => {
                          setEditingPatient(p);
                          setModalOpen(true);
                        }}
                      >
                        Edit
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

      <PatientFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        patient={editingPatient}
      />
    </div>
  );
}
