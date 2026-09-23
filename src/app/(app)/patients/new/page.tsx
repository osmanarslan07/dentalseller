import { PatientDetail } from "../PatientDetail";
import { loadPatientPageContext } from "../detail-data";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const ctx = await loadPatientPageContext();
  const duplicateFrom = from ? ctx.patients.find((p) => p.id === from) ?? null : null;

  return (
    <PatientDetail
      key={duplicateFrom?.id ?? "new"}
      duplicateFrom={duplicateFrom}
      hotelOptions={ctx.hotelOptions}
      roomTypeOptions={ctx.roomTypeOptions}
      profiles={ctx.profiles}
      currentUserId={ctx.currentUserId}
      isAdmin={ctx.isAdmin}
      existingPatients={ctx.patients.map(({ id, name, confirmation_date, responsible_seller_id }) => ({
        id,
        name,
        confirmation_date,
        responsible_seller_id,
      }))}
    />
  );
}
