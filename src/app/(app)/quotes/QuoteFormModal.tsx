"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Quote } from "@/types";
import {
  DEFAULT_QUOTE_BONE_GRAFT_NOTE,
  DEFAULT_QUOTE_INCLUSIONS,
  DEFAULT_QUOTE_INTRO,
  computeQuoteSplit,
} from "@/lib/quote-templates";
import { formatCurrency } from "@/lib/format";
import { createQuote, updateQuote } from "./actions";

export function QuoteFormModal({
  open,
  onClose,
  quote,
  defaultCurrency,
}: {
  open: boolean;
  onClose: () => void;
  quote?: Quote | null;
  defaultCurrency: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [includeBoneGraft, setIncludeBoneGraft] = useState(quote?.include_bone_graft_note ?? false);
  const [totalPrice, setTotalPrice] = useState<string>(quote?.total_price?.toString() ?? "");
  const [depositPercent, setDepositPercent] = useState<string>(quote?.deposit_percent?.toString() ?? "60");
  const isEdit = !!quote;
  const { showToast } = useToast();
  const router = useRouter();

  function handleRequestClose() {
    if (isDirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && quote) {
          await updateQuote(quote.id, formData);
          showToast("Quote saved ✓");
          onClose();
        } else {
          const id = await createQuote(formData);
          showToast("Quote created ✓");
          onClose();
          router.push(`/quotes/${id}/offer`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const { first, second } = computeQuoteSplit(
    totalPrice === "" ? null : Number(totalPrice),
    Number(depositPercent) || 0
  );

  return (
    <Modal open={open} onClose={handleRequestClose} title={isEdit ? "Edit quote" : "New quote"}>
      <form action={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Patient name</Label>
            <Input name="name" required defaultValue={quote?.name} placeholder="Jane Smith" />
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={quote?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </Select>
          </div>
        </div>

        <div>
          <Label>Offer intro</Label>
          <Textarea
            name="intro_text"
            rows={5}
            defaultValue={quote?.intro_text ?? DEFAULT_QUOTE_INTRO}
            placeholder="Explain the recommended treatment…"
          />
          <p className="mt-1 text-xs text-slate-400">Shown as the opening paragraph of the offer letter.</p>
        </div>

        <div>
          <Label>What&apos;s included</Label>
          <Textarea
            name="inclusions"
            rows={6}
            defaultValue={quote?.inclusions ?? DEFAULT_QUOTE_INCLUSIONS}
            placeholder="One item per line"
          />
          <p className="mt-1 text-xs text-slate-400">One item per line — each becomes a bullet on the offer.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Total price</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              name="total_price"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              placeholder="5250"
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Input name="currency" defaultValue={quote?.currency ?? defaultCurrency} placeholder="GBP" />
          </div>
          <div>
            <Label>First-visit deposit %</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              name="deposit_percent"
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
            />
          </div>
        </div>

        {totalPrice !== "" && first != null && second != null && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
            Split: {formatCurrency(first, quote?.currency ?? defaultCurrency)} at first visit +{" "}
            {formatCurrency(second, quote?.currency ?? defaultCurrency)} at second visit
          </p>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="include_bone_graft_note"
              checked={includeBoneGraft}
              onChange={(e) => setIncludeBoneGraft(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
            />
            Mention possible bone graft / sinus lift
          </label>
          {includeBoneGraft && (
            <Textarea
              name="bone_graft_note"
              rows={4}
              defaultValue={quote?.bone_graft_note ?? DEFAULT_QUOTE_BONE_GRAFT_NOTE}
              className="mt-2"
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <Label>Komo reference</Label>
          <Input name="komo_reference" defaultValue={quote?.komo_reference ?? ""} placeholder="Komo lead link or ID" />
        </div>

        <div>
          <Label>Internal notes</Label>
          <Textarea name="notes" rows={2} defaultValue={quote?.notes ?? ""} placeholder="Not shown on the offer…" />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleRequestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create quote"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
