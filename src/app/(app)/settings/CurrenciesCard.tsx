"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClinicConfig, Seller } from "@/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES, currencySymbol, rateLabel } from "@/lib/money";
import { sellerLabel } from "@/lib/sellers";
import { formatDate } from "@/lib/format";
import { saveCurrencySettings, saveSellerCurrency } from "./currency-actions";

/** Clinic settings → Money → Currencies. A clinic that only works in its main currency ticks
 * nothing here and never sees a currency picker anywhere. */
export function CurrenciesCard({
  config,
  hasPatients,
  market,
  sellers,
  canSetSellers,
}: {
  config: ClinicConfig;
  /** Once there are patients the main currency is fixed (changing it means converting data). */
  hasPatients: boolean;
  /** Latest market rate of each currency into the main one. */
  market: { date: string | null; rates: Record<string, number> };
  sellers: Seller[];
  canSetSellers: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [main, setMain] = useState(config.mainCurrency);
  const [deal, setDeal] = useState<string[]>(config.dealCurrencies);
  const [own, setOwn] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(config.fixedRates).map((c) => [c, true]))
  );

  const others = SUPPORTED_CURRENCIES.filter((c) => c !== main);
  const mainChanged = main !== config.mainCurrency;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await saveCurrencySettings(formData);
        showToast("Currencies saved ✓");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function setSellerCurrency(sellerId: string, currency: string) {
    setError(null);
    startTransition(async () => {
      try {
        await saveSellerCurrency(sellerId, currency || null);
        showToast("Usual currency saved ✓");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const savedList = [config.mainCurrency, ...config.dealCurrencies];
  const activeSellers = sellers.filter((s) => s.is_active);

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Currencies</h2>
      <p className="mb-5 text-sm text-slate-500">
        The main currency is what the clinic reports in — commission, tiers, Accounting and every total. If sellers
        agree prices in other currencies too, tick them: each patient then has a deal currency, and amounts are
        converted into the main currency at the rate on the day the price is agreed (payments: the day they come in).
      </p>

      <form action={submit} className="space-y-5">
        <div className="max-w-xs">
          <Label>Main currency</Label>
          {hasPatients ? (
            <>
              <input type="hidden" name="main_currency" value={config.mainCurrency} />
              <p className="py-2 text-sm font-medium text-slate-800">
                {config.mainCurrency} — {CURRENCY_NAMES[config.mainCurrency as keyof typeof CURRENCY_NAMES] ?? ""}
              </p>
              <p className="text-xs text-slate-400">
                Fixed now that the clinic has patients — changing it means converting every amount, which DentalSeller
                support can do for you.
              </p>
            </>
          ) : (
            <>
              <Select
                name="main_currency"
                value={main}
                onChange={(e) => {
                  setMain(e.target.value);
                  setDeal((d) => d.filter((c) => c !== e.target.value));
                }}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_NAMES[c]}
                  </option>
                ))}
              </Select>
              {mainChanged && <p className="mt-1 text-xs text-slate-400">Market rates below update after saving.</p>}
            </>
          )}
        </div>

        <div>
          <Label>Other currencies the clinic deals in</Label>
          <p className="mb-2 text-xs text-slate-400">
            None ticked = everything in {main}, with no currency choices anywhere in the app.
          </p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {others.map((c) => {
              const on = deal.includes(c);
              const marketRate = !mainChanged ? market.rates[c] : undefined;
              return (
                <div key={c} className="px-3 py-2.5">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name={`deal_${c}`}
                      checked={on}
                      onChange={(e) => setDeal((d) => (e.target.checked ? [...d, c] : d.filter((x) => x !== c)))}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                    />
                    <span className="font-medium">{c}</span>
                    <span className="text-slate-500">{CURRENCY_NAMES[c]}</span>
                  </label>
                  {on && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-6 text-sm text-slate-600">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`source_${c}`}
                          value="auto"
                          checked={!own[c]}
                          onChange={() => setOwn((o) => ({ ...o, [c]: false }))}
                        />
                        Market rate
                        {marketRate && (
                          <span className="text-xs text-slate-400">
                            ({rateLabel(c, main, marketRate)}
                            {market.date ? `, ${formatDate(market.date)}` : ""})
                          </span>
                        )}
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`source_${c}`}
                          value="clinic"
                          checked={!!own[c]}
                          onChange={() => setOwn((o) => ({ ...o, [c]: true }))}
                        />
                        Our own rate
                      </label>
                      {own[c] && (
                        <span className="flex items-center gap-1.5">
                          1 {currencySymbol(c)} =
                          <Input
                            type="number"
                            name={`rate_${c}`}
                            step="0.0001"
                            min="0.0001"
                            defaultValue={config.fixedRates[c] ?? (marketRate ? Number(marketRate.toFixed(4)) : "")}
                            className="w-28"
                            required
                          />
                          {main}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Market rates are the European Central Bank&apos;s, updated once a day. Changing a rate here only affects prices
            agreed and payments recorded from now on — what&apos;s already recorded keeps its own rate.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save currencies"}
          </Button>
        </div>
      </form>

      {config.dealCurrencies.length > 0 && activeSellers.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Usual currency per seller</h3>
          <p className="mb-3 text-xs text-slate-500">
            A seller&apos;s new patients and quotes start in this currency — it can still be changed per patient.
          </p>
          <ul className="divide-y divide-slate-100">
            {activeSellers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-slate-800">{sellerLabel(s)}</span>
                <Select
                  value={s.default_currency && savedList.includes(s.default_currency) ? s.default_currency : ""}
                  onChange={(e) => setSellerCurrency(s.id, e.target.value)}
                  disabled={!canSetSellers || pending}
                  className="w-auto"
                  aria-label={`Usual currency for ${sellerLabel(s)}`}
                >
                  <option value="">{config.mainCurrency} (main)</option>
                  {config.dealCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
