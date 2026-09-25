"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { formatCurrency } from "@/lib/format";
import { pickableSellers, sellerLabel } from "@/lib/sellers";
import { CommissionSettings, Seller } from "@/types";
import {
  addSellerRecord,
  deleteSellerRecord,
  mergeSellerRecord,
  renameSellerRecord,
  saveSellerCommission,
  setSellerRecordActive,
} from "./seller-actions";
import { useModule } from "@/components/permissions";

export interface SellerRecordRow {
  seller: Seller;
  patientCount: number;
  commission: CommissionSettings;
}

type Panel = { id: string; kind: "rename" | "commission" | "merge" } | null;

const pct = (r: number) => `${Math.round(r * 10000) / 100}%`;

/** Sellers who get credit for sales but never log in — a coordinator enters their patients.
 * Admin-only. Linking one to an account they've since been given is a merge into that
 * account's seller record. */
export function SellersCard({ rows, allSellers, currentUserId }: { rows: SellerRecordRow[]; allSellers: Seller[]; currentUserId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  // rates only mean something while the clinic has the Sales module
  const sales = useModule("sales");
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>, done: string) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        showToast(done);
        setPanel(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(async () => {
      await addSellerRecord(name);
      setName("");
    }, "Seller added ✓");
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Sellers without an account</h2>
      <p className="mb-5 text-sm text-slate-500">
        People who sell but never log in — a coordinator enters their patients and picks them as the seller.
        {sales && " Their commission shows on Sales performance."} Once someone gets an account, use <em>Link to account</em> to move their
        patients and commission over.
      </p>

      {rows.length === 0 ? (
        <p className="mb-5 text-sm text-slate-400">None yet. You can also add one while creating a patient.</p>
      ) : (
        <ul className="mb-5 divide-y divide-slate-100">
          {rows.map(({ seller, patientCount, commission }) => {
            const open = panel?.id === seller.id ? panel.kind : null;
            return (
              <li key={seller.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-medium text-slate-900">
                      {sellerLabel(seller)}
                      {!seller.is_active && (
                        <span className="ml-2">
                          <Badge tone="amber">Inactive</Badge>
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {patientCount} patient{patientCount === 1 ? "" : "s"}
                      {sales && (
                        <>
                          {" "}· {pct(commission.tier1_rate)} / {pct(commission.tier2_rate)} / {pct(commission.tier3_rate)}
                          {commission.fixed_monthly_payment > 0 && ` + ${formatCurrency(commission.fixed_monthly_payment, commission.currency)}/month`}
                        </>
                      )}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "rename" ? null : { id: seller.id, kind: "rename" })}>
                      Rename
                    </Button>
                    {sales && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "commission" ? null : { id: seller.id, kind: "commission" })}>
                        Commission
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "merge" ? null : { id: seller.id, kind: "merge" })}>
                      Link to account / merge
                    </Button>
                    <Button
                      size="sm"
                      variant={seller.is_active ? "danger" : "secondary"}
                      disabled={pending}
                      onClick={() => run(() => setSellerRecordActive(seller.id, !seller.is_active), seller.is_active ? "Seller deactivated ✓" : "Seller reactivated ✓")}
                    >
                      {seller.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                    {patientCount === 0 && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() => confirm(`Remove ${sellerLabel(seller)} from the seller list?`) && run(() => deleteSellerRecord(seller.id), "Seller removed ✓")}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {open === "rename" && <RenameForm seller={seller} pending={pending} onSubmit={(n) => run(() => renameSellerRecord(seller.id, n), "Seller renamed ✓")} />}
                {sales && open === "commission" && (
                  <CommissionForm
                    commission={commission}
                    pending={pending}
                    onSubmit={(fd) => run(() => saveSellerCommission(seller.id, fd), "Commission rates saved ✓")}
                  />
                )}
                {open === "merge" && (
                  <MergeForm
                    seller={seller}
                    targets={pickableSellers(allSellers).filter((s) => s.id !== seller.id)}
                    currentUserId={currentUserId}
                    pending={pending}
                    onSubmit={(intoId, intoName) =>
                      confirm(
                        `Move ${sellerLabel(seller)}'s ${patientCount} patient${patientCount === 1 ? "" : "s"} and earned commission to ${intoName}, then remove ${sellerLabel(seller)} from the list? This can't be undone.`
                      ) && run(() => mergeSellerRecord(seller.id, intoId), "Sellers merged ✓")
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={add} className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Add a seller without an account</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seller's name, e.g. Ahmet" maxLength={80} required />
        </div>
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </form>
    </Card>
  );
}

function RenameForm({ seller, pending, onSubmit }: { seller: Seller; pending: boolean; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(seller.name ?? "");
  return (
    <form
      className="mt-3 flex items-end gap-2 rounded-lg bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="flex-1">
        <Label>Name</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required autoFocus />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

function CommissionForm({ commission, pending, onSubmit }: { commission: CommissionSettings; pending: boolean; onSubmit: (fd: FormData) => void }) {
  const rate = (r: number) => Math.round(r * 10000) / 100;
  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div>
        <Label>Tier 1 up to (£)</Label>
        <Input type="number" name="tier1_threshold" min="0" step="1" defaultValue={commission.tier1_threshold} required />
      </div>
      <div>
        <Label>Tier 1 rate (%)</Label>
        <Input type="number" name="tier1_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier1_rate)} required />
      </div>
      <div>
        <Label>Tier 2 up to (£)</Label>
        <Input type="number" name="tier2_threshold" min="0" step="1" defaultValue={commission.tier2_threshold} required />
      </div>
      <div>
        <Label>Tier 2 rate (%)</Label>
        <Input type="number" name="tier2_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier2_rate)} required />
      </div>
      <div>
        <Label>Above tier 2 (%)</Label>
        <Input type="number" name="tier3_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier3_rate)} required />
      </div>
      <div>
        <Label>Fixed monthly (£)</Label>
        <Input type="number" name="fixed_monthly_payment" min="0" step="0.01" defaultValue={commission.fixed_monthly_payment} required />
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          Save rates
        </Button>
      </div>
    </form>
  );
}

function MergeForm({
  seller,
  targets,
  currentUserId,
  pending,
  onSubmit,
}: {
  seller: Seller;
  targets: Seller[];
  currentUserId: string;
  pending: boolean;
  onSubmit: (intoId: string, intoName: string) => void;
}) {
  const [into, setInto] = useState("");
  const accounts = targets.filter((s) => s.profile_id);
  const others = targets.filter((s) => !s.profile_id);
  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const target = targets.find((s) => s.id === into);
        if (target) onSubmit(target.id, sellerLabel(target));
      }}
    >
      <Label>Move everything of {sellerLabel(seller)} to</Label>
      <div className="flex items-end gap-2">
        <Select value={into} onChange={(e) => setInto(e.target.value)} required className="flex-1" aria-label="Merge into">
          <option value="" disabled>
            Choose…
          </option>
          {accounts.length > 0 && (
            <optgroup label="Team members (link to their account)">
              {accounts.map((s) => (
                <option key={s.id} value={s.id}>
                  {sellerLabel(s)}
                  {s.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Sellers without an account (duplicate)">
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {sellerLabel(s)}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <Button type="submit" size="sm" disabled={pending || !into}>
          Merge
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        To link someone to a new account: add them in Team above first, let them sign in once, then merge into them here.
        If they already have commission rates of their own, those are kept.
      </p>
    </form>
  );
}
