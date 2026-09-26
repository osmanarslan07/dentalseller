import { createClient } from "@/lib/supabase/server";
import { getPatientTotals } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { patientsToCsv } from "@/lib/csv";

/** Every patient of the clinic as a CSV — built only when someone asks for it, instead of
 * loading all patients into the Data settings page on every visit. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "patients.export")) return new Response("Not allowed", { status: 403 });

  const patients = await getPatientTotals(await createClient());
  return new Response(patientsToCsv(patients), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="patients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
