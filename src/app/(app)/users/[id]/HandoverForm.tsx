"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { handOverCoordinatedPatients } from "../actions";

/** "Move all their patients to…" — for someone who leaves or is away. */
export function HandoverForm({
  fromId,
  fromName,
  count,
  others,
}: {
  fromId: string;
  fromName: string;
  /** How many patients they coordinate now. */
  count: number;
  /** Active members who can coordinate patients. */
  others: { id: string; name: string }[];
}) {
  const [to, setTo] = useState("");
  const [onlyToCome, setOnlyToCome] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  function submit() {
    const toName = others.find((o) => o.id === to)?.name ?? "nobody";
    const which = onlyToCome ? "patients with a visit still to come" : `all ${count} patients`;
    if (!confirm(`Move ${fromName}'s ${which} to ${toName}?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const moved = await handOverCoordinatedPatients(fromId, to || null, onlyToCome);
        showToast(moved === 0 ? "No patients to move" : `${moved} patient${moved === 1 ? "" : "s"} moved ✓`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move the patients");
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-700">Move their patients to someone else</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="New coordinator" className="sm:max-w-xs">
          <option value="">Nobody (no coordinator)</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyToCome} onChange={(e) => setOnlyToCome(e.target.checked)} className="rounded border-slate-300" />
          Only patients with a visit still to come
        </label>
        <Button type="button" size="sm" disabled={pending} onClick={submit} className="sm:ml-auto">
          {pending ? "Moving…" : "Move patients"}
        </Button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
