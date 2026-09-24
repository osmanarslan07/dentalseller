/** Shared by the Files card (browser) and its server actions — keep in step with the
 * patient-files bucket settings in supabase/schema.sql. */

export const PATIENT_FILE_BUCKET = "patient-files";

export const PATIENT_FILE_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function isAllowedPatientFileType(mime: string): boolean {
  return ALLOWED_TYPES.has(mime);
}

/** For the file picker. */
export const PATIENT_FILE_ACCEPT = [...ALLOWED_TYPES, ".heic", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"].join(",");

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
