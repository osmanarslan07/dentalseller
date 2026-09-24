import { notFound } from "next/navigation";
import { getClinicConfig, getPatientFiles, getPatientTransfers, getTransferCompanies } from "@/lib/data";
import { PatientDetail } from "../PatientDetail";
import { loadPatientPageContext } from "../detail-data";
import { requirePagePermission } from "@/lib/permissions";

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePagePermission("patients.view");
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const ctx = await loadPatientPageContext();
  const patient = ctx.patients.find((p) => p.id === id);
  if (!patient) notFound();
  const [transfers, companies, clinicConfig, files] = await Promise.all([
    getPatientTransfers(ctx.supabase, patient.id),
    getTransferCompanies(ctx.supabase),
    getClinicConfig(ctx.supabase),
    getPatientFiles(ctx.supabase, patient.id),
  ]);

  return (
    <PatientDetail
      // remount when switching patients so every field starts from that patient's values — not on
      // every update: adding a transfer touches the patient row (derived flags) and would reset the tab
      key={patient.id}
      patient={patient}
      initialTab={tab}
      hotelOptions={ctx.hotelOptions}
      roomTypeOptions={ctx.roomTypeOptions}
      profiles={ctx.profiles}
      sellers={ctx.sellers}
      currentUserId={ctx.currentUserId}
      canAssignSellers={ctx.canAssignSellers}
      transfers={transfers}
      files={files}
      companies={companies}
      surchargeRate={clinicConfig.cardSurchargeRate}
      deductCosts={clinicConfig.deductCostsFromCommission}
      transferDefaults={clinicConfig.transferDefaults}
      driverMessages={clinicConfig.driverMessages.mode}
    />
  );
}
