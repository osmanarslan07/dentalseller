import { NextRequest, NextResponse } from "next/server";
import { assertSuperadmin, getClinicNames } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The support access log as CSV — for a clinic's request, a lawyer or a court. Includes
 * each row's hash and previous hash, so the chain can be re-verified independently of this
 * app. Superadmin (with two-factor) only. */
export async function GET(request: NextRequest) {
  try {
    await assertSuperadmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const clinicId = sp.get("clinic") || undefined;
  const from = DATE_RE.test(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  const to = DATE_RE.test(sp.get("to") ?? "") ? sp.get("to")! : undefined;

  const admin = createAdminClient();
  const [clinics, { data: superadmins }] = await Promise.all([
    getClinicNames(),
    admin.from("profiles").select("id, display_name").eq("role", "superadmin"),
  ]);
  const clinicName = new Map(clinics);
  const superName = new Map((superadmins ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? ""]));

  const header = ["id", "created_at_utc", "clinic", "clinic_id", "superadmin", "session_id", "event", "path", "detail", "prev_hash", "hash"];
  const lines = [header.join(",")];

  // page through everything that matches, oldest first (the chain's own order)
  for (let offset = 0; ; offset += PAGE) {
    let q = admin
      .from("support_access_log")
      .select("id, created_at, clinic_id, superadmin_id, session_id, event, path, detail, prev_hash, hash")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    if (from) q = q.gte("created_at", `${from}T00:00:00`);
    if (to) q = q.lte("created_at", `${to}T23:59:59.999`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      lines.push(
        [
          r.id,
          new Date(r.created_at).toISOString(),
          r.clinic_id ? (clinicName.get(r.clinic_id) ?? "Deleted clinic") : "",
          r.clinic_id,
          superName.get(r.superadmin_id) ?? r.superadmin_id,
          r.session_id,
          r.event,
          r.path,
          r.detail,
          r.prev_hash,
          r.hash,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    if (!data || data.length < PAGE) break;
  }

  const name = `support-access-log${clinicId ? `-${(clinicName.get(clinicId) ?? "clinic").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
