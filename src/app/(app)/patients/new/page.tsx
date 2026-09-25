import { NewPatientForm } from "../NewPatientForm";
import { loadPatientPageContext } from "../detail-data";
import { requirePagePermission } from "@/lib/permissions";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePagePermission("patients.edit");
  const { from } = await searchParams;
  const ctx = await loadPatientPageContext();
  const duplicateFrom = from ? ctx.patients.find((p) => p.id === from) ?? null : null;

  return (
    <NewPatientForm
      key={duplicateFrom?.id ?? "new"}
      duplicateFrom={duplicateFrom}
      sellers={ctx.sellers}
      currentUserId={ctx.currentUserId}
      canAssignSellers={ctx.canAssignSellers}
      coordinators={ctx.coordinators.filter((c) => c.pickable)}
      existingPatients={ctx.patients.map(({ id, name, confirmation_date, responsible_seller_id }) => ({
        id,
        name,
        confirmation_date,
        responsible_seller_id,
      }))}
    />
  );
}
