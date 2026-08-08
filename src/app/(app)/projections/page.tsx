import { createClient } from "@/lib/supabase/server";
import { getPatients, getSettings } from "@/lib/data";
import { addMonths, computeMonthlyAggregates, currentMonthKey, monthLabel } from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { CloseoutSummary } from "./CloseoutSummary";
import { Money, Percent } from "@/components/privacy";
import { CommissionSettings } from "@/types";

function tierTone(total: number, settings: CommissionSettings): "slate" | "amber" | "green" {
  if (total <= settings.tier1_threshold) return "slate";
  if (total <= settings.tier2_threshold) return "amber";
  return "green";
}

export default async function ProjectionsPage() {
  const supabase = await createClient();
  const [patients, settings] = await Promise.all([getPatients(supabase), getSettings(supabase)]);

  const aggregates = computeMonthlyAggregates(patients, settings);
  const aggregateMap = new Map(aggregates.map((a) => [a.month, a]));

  const thisMonth = currentMonthKey();
  const months = aggregates.map((a) => a.month);
  let minMonth = months.length ? months.reduce((a, b) => (a < b ? a : b)) : thisMonth;
  let maxMonth = months.length ? months.reduce((a, b) => (a > b ? a : b)) : thisMonth;
  if (thisMonth < minMonth) minMonth = thisMonth;
  if (thisMonth > maxMonth) maxMonth = thisMonth;

  const fullRange: string[] = [];
  for (let m = minMonth; m <= maxMonth; m = addMonths(m, 1)) fullRange.push(m);

  const rows = fullRange.map((m) => {
    const a = aggregateMap.get(m);
    return (
      a ?? {
        month: m,
        actualTotal: 0,
        expectedTotal: 0,
        actualRate: settings.tier1_rate,
        expectedRate: settings.tier1_rate,
        actualCommission: settings.fixed_monthly_payment,
        expectedCommission: settings.fixed_monthly_payment,
        patientCount: 0,
      }
    );
  });

  rows.reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Monthly Projections</h1>
        <p className="mt-1 text-sm text-slate-500">
          Commission is <Percent value={settings.tier1_rate} /> up to{" "}
          <Money value={settings.tier1_threshold} currency={settings.currency} />,{" "}
          <Percent value={settings.tier2_rate} /> up to{" "}
          <Money value={settings.tier2_threshold} currency={settings.currency} />, then{" "}
          <Percent value={settings.tier3_rate} /> above. Plus{" "}
          <Money value={settings.fixed_monthly_payment} currency={settings.currency} /> fixed per month.
        </p>
      </div>

      <CloseoutSummary
        patients={patients}
        settings={settings}
        months={[...fullRange].reverse()}
        defaultMonth={thisMonth}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-4 pr-4 font-medium">Month</th>
                <th className="py-3 pr-4 font-medium">Actual received</th>
                <th className="py-3 pr-4 font-medium">Actual tier</th>
                <th className="py-3 pr-4 font-medium">Actual commission</th>
                <th className="py-3 pr-4 font-medium">Expected (scheduled)</th>
                <th className="py-3 pr-4 font-medium">Expected tier</th>
                <th className="py-3 pr-4 font-medium">Expected commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isCurrent = r.month === thisMonth;
                return (
                  <tr
                    key={r.month}
                    className={`border-b border-slate-50 last:border-0 ${
                      isCurrent ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <td className="py-3 pl-4 pr-4 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {monthLabel(r.month)}
                        {isCurrent && <Badge tone="blue">Current</Badge>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatCurrency(r.actualTotal, settings.currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={tierTone(r.actualTotal, settings)}>
                        <Percent value={r.actualRate} />
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      <Money value={r.actualCommission} currency={settings.currency} />
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatCurrency(r.expectedTotal, settings.currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={tierTone(r.expectedTotal, settings)}>
                        <Percent value={r.expectedRate} />
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      <Money value={r.expectedCommission} currency={settings.currency} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
