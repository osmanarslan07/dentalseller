"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { formatCurrency } from "@/lib/format";
import { PatientExtra, PatientExtraKind } from "@/types";
import { addPatientExtra, deletePatientExtra, updatePatientExtra } from "./extra-actions";

const KIND_LABELS: Record<PatientExtraKind, string> = {
  night: "Extra night",
  treatment: "Extra treatment",
  other: "Other",
};

/** Extras sold on one visit — added to what the patient owes, and counted toward commission
 * like the treatment itself. */
export function ExtrasSection({
  patientId,
  visitKey,
  extras,
  hotel,
  compact = false,
}: {
  patientId: string;
  visitKey: string;
  extras: PatientExtra[];
  /** The visit's hotel — the default description for an extra night. */
  hotel: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = extras.reduce((sum, e) => sum + e.total, 0);

  function handleDelete(e: PatientExtra) {
    if (!confirm(`Delete ${e.description || KIND_LABELS[e.kind].toLowerCase()}?`)) return;
    startTransition(async () => {
      try {
        await deletePatientExtra(e.id);
        showToast("Extra deleted");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to delete", "error");
      }
    });
  }

  const body = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={compact ? "text-sm font-semibold text-slate-700" : "text-base font-semibold text-slate-900"}>
            Extras{" "}
            {extras.length > 0 && <span className="font-normal text-slate-500">· {formatCurrency(total, "GBP")}</span>}
          </h3>
          {!compact && (
            <p className="text-xs text-slate-500">
              Extra hotel nights or treatments sold on this visit — added to what the patient owes.
            </p>
          )}
        </div>
        {!adding && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            + Add extra
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <ExtraForm
            hotel={hotel}
            onCancel={() => setAdding(false)}
            onSave={async (formData) => {
              await addPatientExtra(patientId, visitKey, formData);
              showToast("Extra added ✓");
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {extras.length === 0 && !adding ? (
        <p className="text-sm text-slate-400">No extras.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {extras.map((e) =>
            editingId === e.id ? (
              <li key={e.id} className="py-2">
                <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                  <ExtraForm
                    extra={e}
                    hotel={hotel}
                    onCancel={() => setEditingId(null)}
                    onSave={async (formData) => {
                      await updatePatientExtra(e.id, formData);
                      showToast("Extra saved ✓");
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                </div>
              </li>
            ) : (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge tone={e.kind === "night" ? "blue" : e.kind === "treatment" ? "green" : "slate"}>
                    {KIND_LABELS[e.kind]}
                  </Badge>
                  <span className="text-slate-700">{e.description || KIND_LABELS[e.kind]}</span>
                  <span className="text-xs text-slate-400">
                    {e.quantity} × {formatCurrency(e.unit_price, "GBP")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-slate-800">{formatCurrency(e.total, "GBP")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(e.id);
                      setAdding(false);
                    }}
                    className="text-xs font-medium text-teal-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(e)}
                    disabled={pending}
                    className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </>
  );

  return compact ? <div className="mt-3 border-t border-slate-100 pt-3">{body}</div> : <Card className="p-5">{body}</Card>;
}

function ExtraForm({
  extra,
  hotel,
  onCancel,
  onSave,
}: {
  extra?: PatientExtra;
  hotel: string | null;
  onCancel: () => void;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<PatientExtraKind>(extra?.kind ?? "night");
  const [quantity, setQuantity] = useState(String(extra?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(extra?.unit_price != null ? String(extra.unit_price) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSave(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>What</Label>
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as PatientExtraKind)}>
            <option value="night">Extra hotel night(s)</option>
            <option value="treatment">Extra treatment</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <Label>Description</Label>
          <Input
            name="description"
            defaultValue={extra?.description ?? ""}
            placeholder={kind === "night" ? hotel || "Hotel name / dates" : kind === "treatment" ? "2x zirconium crown" : "Airport VIP lounge"}
          />
        </div>
        <div>
          <Label>{kind === "night" ? "Nights" : "Quantity"}</Label>
          <Input
            type="number"
            name="quantity"
            min="0.01"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>{kind === "night" ? "Price per night (£)" : "Unit price (£)"}</Label>
          <Input
            type="number"
            name="unit_price"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2 flex items-end pb-2 text-sm text-slate-600">
          Total: <span className="ml-1 font-semibold text-slate-900">{formatCurrency(lineTotal, "GBP")}</span>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : extra ? "Save extra" : "Add extra"}
        </Button>
      </div>
    </form>
  );
}
