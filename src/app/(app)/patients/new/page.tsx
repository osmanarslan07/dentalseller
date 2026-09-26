import { NewPatientForm } from "../NewPatientForm";
import { loadPatientPageContext } from "../detail-data";
import { requirePagePermission } from "@/lib/permissions";
import { getPatient } from "@/lib/data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePagePermission("patients.edit");
  const { from } = await searchParams;
  const ctx = await loadPatientPageContext();
  const duplicateFrom = from && UUID_RE.test(from) ? await getPatient(ctx.supabase, from) : null;

  return (
    <NewPatientForm
      key={duplicateFrom?.id ?? "new"}
      duplicateFrom={duplicateFrom}
      sellers={ctx.sellers}
      currentUserId={ctx.currentUserId}
      canAssignSellers={ctx.canAssignSellers}
      coordinators={ctx.coordinators.filter((c) => c.pickable)}
    />
  );
}
