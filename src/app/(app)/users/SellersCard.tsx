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
import { useCurrencies } from "@/components/currency";
import { currencySymbol } from "@/lib/money";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

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
  const t = useT();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const { main: mainCurrency } = useCurrencies();
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
        setError(e instanceof Error ? e.message : t("Something went wrong"));
      }
    });
  }

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(async () => {
      await addSellerRecord(name);
      setName("");
    }, t("Seller added ✓"));
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Sellers without an account")}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {t("People who sell but never log in — a coordinator enters their patients and picks them as the seller.")}
        {sales && ` ${t("Their commission shows on Sales performance.")}`}{" "}
        {rich(t("Once someone gets an account, use {link} to move their patients and commission over."), { link: <em>{t("Link to account")}</em> })}
      </p>

      {rows.length === 0 ? (
        <p className="mb-5 text-sm text-slate-400">{t("None yet. You can also add one while creating a patient.")}</p>
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
                          <Badge tone="amber">{t("Inactive")}</Badge>
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {patientCount === 1 ? t("1 patient") : t("{n} patients", { n: patientCount })}
                      {sales && (
                        <>
                          {" "}· {pct(commission.tier1_rate)} / {pct(commission.tier2_rate)} / {pct(commission.tier3_rate)}
                          {commission.fixed_monthly_payment > 0 && ` + ${t("{amount}/month", { amount: formatCurrency(commission.fixed_monthly_payment, mainCurrency) })}`}
                        </>
                      )}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "rename" ? null : { id: seller.id, kind: "rename" })}>
                      {t("Rename")}
                    </Button>
                    {sales && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "commission" ? null : { id: seller.id, kind: "commission" })}>
                        {t("Commission")}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPanel(open === "merge" ? null : { id: seller.id, kind: "merge" })}>
                      {t("Link to account / merge")}
                    </Button>
                    <Button
                      size="sm"
                      variant={seller.is_active ? "danger" : "secondary"}
                      disabled={pending}
                      onClick={() => run(() => setSellerRecordActive(seller.id, !seller.is_active), seller.is_active ? t("Seller deactivated ✓") : t("Seller reactivated ✓"))}
                    >
                      {seller.is_active ? t("Deactivate") : t("Reactivate")}
                    </Button>
                    {patientCount === 0 && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() => confirm(t("Remove {name} from the seller list?", { name: sellerLabel(seller) })) && run(() => deleteSellerRecord(seller.id), t("Seller removed ✓"))}
                      >
                        {t("Delete")}
                      </Button>
                    )}
                  </div>
                </div>

                {open === "rename" && <RenameForm seller={seller} pending={pending} onSubmit={(n) => run(() => renameSellerRecord(seller.id, n), t("Seller renamed ✓"))} />}
                {sales && open === "commission" && (
                  <CommissionForm
                    commission={commission}
                    pending={pending}
                    onSubmit={(fd) => run(() => saveSellerCommission(seller.id, fd), t("Commission rates saved ✓"))}
                  />
                )}
                {open === "merge" && (
                  <MergeForm
                    seller={seller}
                    targets={pickableSellers(allSellers, null, true).filter((s) => s.id !== seller.id)}
                    currentUserId={currentUserId}
                    pending={pending}
                    onSubmit={(intoId, intoName) =>
                      confirm(
                        t("Move {from}'s {n} patient(s) and earned commission to {into}, then remove {from} from the list? This can't be undone.", {
                          from: sellerLabel(seller),
                          n: patientCount,
                          into: intoName,
                        })
                      ) && run(() => mergeSellerRecord(seller.id, intoId), t("Sellers merged ✓"))
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
          <Label>{t("Add a seller without an account")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Seller's name, e.g. Ahmet")} maxLength={80} required />
        </div>
        <Button type="submit" disabled={pending}>
          {t("Add")}
        </Button>
      </form>
    </Card>
  );
}

function RenameForm({ seller, pending, onSubmit }: { seller: Seller; pending: boolean; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(seller.name ?? "");
  const t = useT();
  return (
    <form
      className="mt-3 flex items-end gap-2 rounded-lg bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="flex-1">
        <Label>{t("Name")}</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required autoFocus />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {t("Save")}
      </Button>
    </form>
  );
}

function CommissionForm({ commission, pending, onSubmit }: { commission: CommissionSettings; pending: boolean; onSubmit: (fd: FormData) => void }) {
  const rate = (r: number) => Math.round(r * 10000) / 100;
  const sym = currencySymbol(useCurrencies().main);
  const t = useT();
  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div>
        <Label>{t("Tier 1 up to ({sym})", { sym })}</Label>
        <Input type="number" name="tier1_threshold" min="0" step="1" defaultValue={commission.tier1_threshold} required />
      </div>
      <div>
        <Label>{t("Tier 1 rate (%)")}</Label>
        <Input type="number" name="tier1_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier1_rate)} required />
      </div>
      <div>
        <Label>{t("Tier 2 up to ({sym})", { sym })}</Label>
        <Input type="number" name="tier2_threshold" min="0" step="1" defaultValue={commission.tier2_threshold} required />
      </div>
      <div>
        <Label>{t("Tier 2 rate (%)")}</Label>
        <Input type="number" name="tier2_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier2_rate)} required />
      </div>
      <div>
        <Label>{t("Above tier 2 (%)")}</Label>
        <Input type="number" name="tier3_rate" min="0" max="99" step="0.01" defaultValue={rate(commission.tier3_rate)} required />
      </div>
      <div>
        <Label>{t("Fixed monthly ({sym})", { sym })}</Label>
        <Input type="number" name="fixed_monthly_payment" min="0" step="0.01" defaultValue={commission.fixed_monthly_payment} required />
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t("Save rates")}
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
  const t = useT();
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
      <Label>{t("Move everything of {name} to", { name: sellerLabel(seller) })}</Label>
      <div className="flex items-end gap-2">
        <Select value={into} onChange={(e) => setInto(e.target.value)} required className="flex-1" aria-label={t("Merge into")}>
          <option value="" disabled>
            {t("Choose…")}
          </option>
          {accounts.length > 0 && (
            <optgroup label={t("Team members (link to their account)")}>
              {accounts.map((s) => (
                <option key={s.id} value={s.id}>
                  {sellerLabel(s)}
                  {s.id === currentUserId ? ` ${t("(you)")}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={t("Sellers without an account (duplicate)")}>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {sellerLabel(s)}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <Button type="submit" size="sm" disabled={pending || !into}>
          {t("Merge")}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {t("To link someone to a new account: add them in Team above first, let them sign in once, then merge into them here. If they already have commission rates of their own, those are kept.")}
      </p>
    </form>
  );
}
