import { NextRequest, NextResponse } from "next/server";
import { monitoredCron } from "@/lib/job-runs";
import { fetchEurRates } from "@/lib/rates";

export const dynamic = "force-dynamic";

/** Today's market rates, EUR → every supported currency (any pair is crossed through EUR). */
export const GET = monitoredCron("exchange-rate", async (request: NextRequest) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchEurRates("latest");
  if (!result || Object.keys(result.rates).length === 0) {
    return NextResponse.json({ error: "No rates fetched" }, { status: 502 });
  }
  return NextResponse.json({ saved: result });
});
