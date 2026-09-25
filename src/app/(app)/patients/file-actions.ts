"use server";

import { st } from "@/i18n/server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { requirePermission } from "@/lib/permissions";
import { recordSupportEvent } from "@/lib/support-log";
import { recordRef } from "@/lib/activity-mask";
import { PATIENT_FILE_BUCKET, PATIENT_FILE_MAX_BYTES, isAllowedPatientFileType } from "@/lib/patient-files";

/** Files go straight from the browser to Storage (a request through the app would hit the
 * hosting body limit long before 20 MB), through signed upload URLs issued here — so the
 * permission and the path are decided on the server, never by the client. */

export interface UploadTicket {
  name: string;
  path: string;
  token: string;
}

/** The patient, if the caller can see it (RLS), with its clinic. */
async function visiblePatient(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  const { data } = await supabase.from("patients").select("id, clinic_id").eq("id", patientId).maybeSingle();
  if (!data) throw new Error(await st("Patient not found"));
  return data as { id: string; clinic_id: string };
}

/** Keeps a readable name in the stored path; the uuid makes it unique. */
function safeSegment(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-100) || "file";
}

export async function createPatientFileUploads(
  patientId: string,
  files: { name: string; size: number; type: string }[]
): Promise<UploadTicket[]> {
  await requirePermission("files.manage");
  const supabase = await createClient();
  const patient = await visiblePatient(supabase, patientId);
  if (files.length === 0) throw new Error(await st("Choose a file"));
  if (files.length > 20) throw new Error(await st("Up to 20 files at a time"));

  for (const f of files) {
    if (f.size > PATIENT_FILE_MAX_BYTES) throw new Error(`${f.name} is over 20 MB`);
    if (!isAllowedPatientFileType(f.type)) throw new Error(`${f.name}: images, PDF, Office documents and text files only`);
  }

  const admin = createAdminClient();
  return Promise.all(
    files.map(async (f) => {
      const path = `${patient.clinic_id}/${patient.id}/${randomUUID()}-${safeSegment(f.name)}`;
      const { data, error } = await admin.storage.from(PATIENT_FILE_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message ?? "Couldn't start the upload");
      return { name: f.name, path, token: data.token };
    })
  );
}

/** After the browser finished uploading: one row per file that really arrived. */
export async function recordPatientFiles(
  patientId: string,
  uploaded: { name: string; path: string; mime: string | null }[]
): Promise<void> {
  const user = await requirePermission("files.manage");
  const supabase = await createClient();
  const patient = await visiblePatient(supabase, patientId);
  const folder = `${patient.clinic_id}/${patient.id}`;

  const admin = createAdminClient();
  const { data: objects, error: listError } = await admin.storage.from(PATIENT_FILE_BUCKET).list(folder, { limit: 1000 });
  if (listError) throw new Error(listError.message);
  const sizeByName = new Map((objects ?? []).map((o) => [o.name, Number(o.metadata?.size ?? 0)]));

  const rows = uploaded
    .filter((u) => u.path.startsWith(`${folder}/`) && sizeByName.has(u.path.slice(folder.length + 1)))
    .map((u) => ({
      patient_id: patient.id,
      clinic_id: patient.clinic_id,
      name: u.name.trim().slice(0, 200) || "file",
      path: u.path,
      size: sizeByName.get(u.path.slice(folder.length + 1)) ?? 0,
      mime: u.mime,
      uploaded_by: user.actorId,
    }));
  if (rows.length === 0) throw new Error(await st("The upload didn't arrive — try again"));

  const { error } = await supabase.from("patient_files").insert(rows);
  if (error) {
    // don't leave orphans behind in storage
    await admin.storage.from(PATIENT_FILE_BUCKET).remove(rows.map((r) => r.path));
    throw new Error(error.message);
  }

  await logActivity(
    supabase,
    user.actorId,
    "file_uploaded",
    "patient",
    patient.id,
    rows.map((r) => r.name).join(", ")
  );
  revalidatePath(`/patients/${patient.id}`);
}

/** A link that opens the file for an hour. */
export async function getPatientFileLink(fileId: string, download = false): Promise<string> {
  const { viewer } = await requirePermission("files.view", { forRead: true });
  const supabase = await createClient();
  const { data: file } = await supabase.from("patient_files").select("path, name, patient_id").eq("id", fileId).maybeSingle();
  if (!file) throw new Error(await st("File not found"));

  if (viewer.support) {
    await recordSupportEvent({
      sessionId: viewer.support.sessionId,
      superadminId: viewer.authUserId,
      clinicId: viewer.clinicId,
      event: "record_file_opened",
      detail: recordRef("patient", file.patient_id) ?? undefined,
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PATIENT_FILE_BUCKET)
    .createSignedUrl(file.path, 60 * 60, download ? { download: file.name } : undefined);
  if (error || !data) throw new Error(error?.message ?? "Couldn't open the file");
  return data.signedUrl;
}

export async function renamePatientFile(fileId: string, rawName: string): Promise<void> {
  const user = await requirePermission(["files.manage", "files.delete"]);
  const name = rawName.trim().slice(0, 200);
  if (!name) throw new Error(await st("Give the file a name"));
  const supabase = await createClient();

  const { data: before } = await supabase.from("patient_files").select("name, patient_id").eq("id", fileId).maybeSingle();
  if (!before) throw new Error(await st("File not found"));
  const { data, error } = await supabase.from("patient_files").update({ name }).eq("id", fileId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(await st("Only whoever uploaded it, or someone who can delete anyone's files, can rename this file"));

  await logActivity(supabase, user.actorId, "file_renamed", "patient", before.patient_id, `${before.name} → ${name}`);
  revalidatePath(`/patients/${before.patient_id}`);
}

export async function deletePatientFile(fileId: string): Promise<void> {
  const user = await requirePermission(["files.manage", "files.delete"]);
  const supabase = await createClient();

  const { data, error } = await supabase.from("patient_files").delete().eq("id", fileId).select("name, path, patient_id");
  if (error) throw new Error(error.message);
  const file = data?.[0];
  if (!file) throw new Error(await st("Only whoever uploaded it, or someone who can delete anyone's files, can delete this file"));

  const { error: removeError } = await createAdminClient().storage.from(PATIENT_FILE_BUCKET).remove([file.path]);
  if (removeError) console.error("Patient file removal failed:", removeError.message);

  await logActivity(supabase, user.actorId, "file_deleted", "patient", file.patient_id, file.name);
  revalidatePath(`/patients/${file.patient_id}`);
}
