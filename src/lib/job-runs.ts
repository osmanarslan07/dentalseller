import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JobId } from "@/lib/jobs";

const RETENTION_DAYS = 30;

/** Short, human summary of a job's JSON response for the status page — e.g. "sent 3" or
 * "No reminders today". Never the full payload (it can contain reminder text). */
function summarize(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.reason === "string") return b.reason;
  if (b.sent === true) return `sent ${typeof b.count === "number" ? b.count : ""}`.trim();
  if (Array.isArray(b.saved)) return `saved ${b.saved.length} rate${b.saved.length === 1 ? "" : "s"}`;
  return null;
}

/** Wraps a cron route so every authorized run is recorded in job_runs — success or failure,
 * including a thrown error — without changing the route's own response. Unauthorized
 * requests (401) aren't runs and aren't recorded. Recording is best-effort: a logging
 * failure never turns a successful job into a failed response. */
export function monitoredCron(job: JobId, handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startedAt = new Date().toISOString();
    let response: NextResponse;
    let thrown: string | null = null;

    try {
      response = await handler(request);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
      response = NextResponse.json({ error: thrown }, { status: 500 });
    }

    if (response.status !== 401) {
      try {
        const body = await response.clone().json().catch(() => null);
        const ok = response.ok && !thrown;
        const error = ok ? null : thrown ?? (body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
        const admin = createAdminClient();
        await admin.from("job_runs").insert({
          job,
          started_at: startedAt,
          ok,
          status_code: response.status,
          summary: ok ? summarize(body) : null,
          error,
        });
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
        await admin.from("job_runs").delete().eq("job", job).lt("started_at", cutoff);
      } catch (err) {
        console.error(`Recording ${job} run failed:`, err);
      }
    }

    return response;
  };
}
