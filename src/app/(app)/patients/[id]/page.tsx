import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatient, getPatientFiles, getPatientTransfers, getTransferCompanies } from "@/lib/data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (!UUID_RE.test(id)) notFound();
  const [ctx, patient] = await Promise.all([loadPatientPageContext(), getPatient(await createClient(), id)]);
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
      coordinators={ctx.coordinators}
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
