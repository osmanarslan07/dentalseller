"use client";

import { useState, useTransition } from "react";
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
import { useCurrencies } from "@/components/currency";
import { createQuote, updateQuote } from "./actions";
import { useT } from "@/i18n/client";

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
  const currencies = useCurrencies();
  const quoteCurrency = quote?.currency ?? defaultCurrency;
  // the clinic's currencies, plus an older quote's own if it's no longer one of them
  const currencyOptions = currencies.list.includes(quoteCurrency) ? currencies.list : [...currencies.list, quoteCurrency];
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [includeBoneGraft, setIncludeBoneGraft] = useState(quote?.include_bone_graft_note ?? false);
  const [totalPrice, setTotalPrice] = useState<string>(quote?.total_price?.toString() ?? "");
  const [splitMode, setSplitMode] = useState<"percent" | "amount">(quote?.split_mode ?? "percent");
  const [depositPercent, setDepositPercent] = useState<string>(quote?.deposit_percent?.toString() ?? "60");
  const [firstVisitAmount, setFirstVisitAmount] = useState<string>(
    quote?.first_visit_amount?.toString() ?? ""
  );
  const isEdit = !!quote;
  const { showToast } = useToast();
  const t = useT();

  function handleRequestClose() {
    if (isDirty && !confirm(t("Discard unsaved changes?"))) return;
    onClose();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && quote) {
          await updateQuote(quote.id, formData);
          showToast(t("Quote saved ✓"));
          onClose();
        } else {
          await createQuote(formData);
          showToast(t("Quote created ✓"));
          onClose();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Something went wrong"));
      }
    });
  }

  const { first, second } = computeQuoteSplit(
    totalPrice === "" ? null : Number(totalPrice),
    splitMode,
    Number(depositPercent) || 0,
    firstVisitAmount === "" ? null : Number(firstVisitAmount)
  );

  return (
    <Modal open={open} onClose={handleRequestClose} title={isEdit ? t("Edit quote") : t("New quote")}>
      <form action={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("Patient name")}</Label>
            <Input name="name" required defaultValue={quote?.name} placeholder="Jane Smith" />
          </div>
          <div>
            <Label>{t("Label (optional)")}</Label>
            <Input name="label" defaultValue={quote?.label ?? ""} placeholder={t("Option A — implants")} />
            <p className="mt-1 text-xs text-slate-400">{t("Tells apart multiple quotes for the same patient. Not shown on the offer.")}</p>
          </div>
          <div>
            <Label>{t("Status")}</Label>
            <Select name="status" defaultValue={quote?.status ?? "draft"}>
              <option value="draft">{t("Draft")}</option>
              <option value="sent">{t("Sent")}</option>
              <option value="accepted">{t("Accepted")}</option>
              <option value="declined">{t("Declined")}</option>
            </Select>
          </div>
        </div>

        <div>
          <Label>{t("Offer intro")}</Label>
          <Textarea
            name="intro_text"
            rows={5}
            defaultValue={quote?.intro_text ?? DEFAULT_QUOTE_INTRO}
            placeholder={t("Explain the recommended treatment…")}
          />
          <p className="mt-1 text-xs text-slate-400">{t("Shown as the opening paragraph of the offer letter.")}</p>
        </div>

        <div>
          <Label>{t("What's included")}</Label>
          <Textarea
            name="inclusions"
            rows={6}
            defaultValue={quote?.inclusions ?? DEFAULT_QUOTE_INCLUSIONS}
            placeholder={t("One item per line")}
          />
          <p className="mt-1 text-xs text-slate-400">{t("One item per line — each becomes a bullet on the offer.")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("Total price")}</Label>
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
            <Label>{t("Currency")}</Label>
            {currencyOptions.length > 1 ? (
              <Select name="currency" defaultValue={quoteCurrency}>
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            ) : (
              <>
                <input type="hidden" name="currency" value={quoteCurrency} />
                <p className="py-2 text-sm text-slate-700">{quoteCurrency}</p>
              </>
            )}
          </div>
        </div>

        <div>
          <Label>{t("Payment split")}</Label>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSplitMode("percent")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                splitMode === "percent" ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t("Show as percentage")}
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("amount")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                splitMode === "amount" ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t("Fixed amount")}
            </button>
          </div>
          <input type="hidden" name="split_mode" value={splitMode} />

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {splitMode === "percent" ? (
              <div>
                <Label>{t("First-visit deposit %")}</Label>
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
            ) : (
              <div>
                <Label>{t("First-visit payment")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  name="first_visit_amount"
                  value={firstVisitAmount}
                  onChange={(e) => setFirstVisitAmount(e.target.value)}
                  placeholder="3150"
                />
                <p className="mt-1 text-xs text-slate-400">{t("Second visit is total minus this amount.")}</p>
              </div>
            )}
          </div>

          {totalPrice !== "" && first != null && second != null && (
            <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
              {t("Split: {first} at first visit + {second} at second visit", {
                first: formatCurrency(first, quote?.currency ?? defaultCurrency),
                second: formatCurrency(second, quote?.currency ?? defaultCurrency),
              })}
            </p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="include_bone_graft_note"
              checked={includeBoneGraft}
              onChange={(e) => setIncludeBoneGraft(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
            />
            {t("Mention possible bone graft / sinus lift")}
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
          <Label>{t("Komo reference")}</Label>
          <Input name="komo_reference" defaultValue={quote?.komo_reference ?? ""} placeholder={t("Komo lead link or ID")} />
        </div>

        <div>
          <Label>{t("Internal notes")}</Label>
          <Textarea name="notes" rows={2} defaultValue={quote?.notes ?? ""} placeholder={t("Not shown on the offer…")} />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleRequestClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("Saving…") : isEdit ? t("Save changes") : t("Create quote")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
