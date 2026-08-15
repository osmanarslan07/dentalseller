import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTryRate } from "@/lib/currency";

export const dynamic = "force-dynamic";

const BASES = ["GBP", "USD", "EUR"];

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.all(
    BASES.map(async (base) => {
      const rate = await getTryRate(base);
      return { base, rate };
    })
  );

  const rows = results
    .filter((r): r is { base: string; rate: number } => r.rate !== null)
    .map((r) => ({ base: r.base, quote: "TRY", rate: r.rate, rate_date: today }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rates fetched" }, { status: 502 });
  }

  const { error } = await supabase
    .from("exchange_rates")
    .upsert(rows, { onConflict: "base,quote,rate_date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: rows });
}
