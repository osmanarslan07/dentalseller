import { NewPatientForm } from "../NewPatientForm";
import { loadPatientPageContext } from "../detail-data";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const ctx = await loadPatientPageContext();
  const duplicateFrom = from ? ctx.patients.find((p) => p.id === from) ?? null : null;

  return (
    <NewPatientForm
      key={duplicateFrom?.id ?? "new"}
      duplicateFrom={duplicateFrom}
      profiles={ctx.profiles}
      existingPatients={ctx.patients.map(({ id, name, confirmation_date, responsible_seller_id }) => ({
        id,
        name,
        confirmation_date,
        responsible_seller_id,
      }))}
    />
  );
}
