import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQuote, getSettings } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { PrintButton } from "@/components/PrintButton";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default async function QuoteOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [quote, settings] = await Promise.all([getQuote(supabase, id), getSettings(supabase)]);

  if (!quote) notFound();

  const clinic = {
    name: settings.clinic_name,
    shortName: settings.clinic_short_name,
    address: settings.clinic_address,
    phone: settings.clinic_phone,
    email: settings.clinic_email,
    logoUrl: settings.clinic_logo_url ?? null,
  };

  const inclusions = (quote.inclusions || "")
    .split("\n")
    .map((s) => s.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  const { first, second } = computeQuoteSplit(quote.total_price, quote.deposit_percent);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <div className="flex flex-col items-start gap-4 border-b-4 border-slate-900 pb-4 sm:flex-row sm:justify-between sm:gap-6 print:flex-row print:justify-between print:gap-6">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt={clinic.shortName} className="h-24 w-auto object-contain" />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center text-sm font-medium text-slate-400">
              No Logo
            </div>
          )}
          <div className="text-xs leading-relaxed text-slate-600 sm:text-right print:text-right">
            <p>{clinic.address}</p>
            <p className="font-semibold text-slate-900">{clinic.phone}</p>
            <p>
              EMAIL: <span className="font-medium text-teal-700">{clinic.email}</span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm font-bold text-slate-900">{todayLabel()}</p>

        <div className="mt-4">
          <h1 className="border-b border-slate-900 pb-1 text-xl font-bold text-slate-900">Treatment Offer</h1>
          <p className="mt-4 text-sm text-slate-700">Dear {quote.name},</p>

          {quote.intro_text && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{quote.intro_text}</p>
          )}

          {inclusions.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm text-slate-800">
              {inclusions.map((item, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-teal-600">–</span>
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          )}

          {quote.total_price != null && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-4 rounded-lg bg-teal-600 px-4 py-3 text-white">
                <span className="text-sm font-semibold">Total Cost</span>
                <span className="text-xl font-bold tabular-nums">
                  {formatCurrency(quote.total_price, quote.currency)}
                </span>
              </div>

              {first != null && second != null && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Split Payment is Available as:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                    <li className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-1.5">
                      <span>
                        {quote.deposit_percent}% at First Visit
                      </span>
                      <span className="font-bold tabular-nums">{formatCurrency(first, quote.currency)}</span>
                    </li>
                    <li className="flex items-baseline justify-between gap-4">
                      <span>{100 - quote.deposit_percent}% at Second Visit</span>
                      <span className="font-bold tabular-nums">{formatCurrency(second, quote.currency)}</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {quote.include_bone_graft_note && quote.bone_graft_note && (
            <p className="mt-6 whitespace-pre-line text-xs leading-relaxed text-slate-500">
              {quote.bone_graft_note}
            </p>
          )}

          <p className="mt-8 text-sm text-slate-700">
            Thank you,
            <br />
            {clinic.name}
          </p>
        </div>
      </div>
    </div>
  );
}
