import { notFound } from "next/navigation";
import { PatientDetail } from "../PatientDetail";
import { loadPatientPageContext } from "../detail-data";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientPageContext();
  const patient = ctx.patients.find((p) => p.id === id);
  if (!patient) notFound();

  return (
    <PatientDetail
      // remount on navigation between patients so every field starts from that patient's values
      key={patient.id + patient.updated_at}
      patient={patient}
      hotelOptions={ctx.hotelOptions}
      roomTypeOptions={ctx.roomTypeOptions}
      profiles={ctx.profiles}
      currentUserId={ctx.currentUserId}
      isAdmin={ctx.isAdmin}
    />
  );
}
