"use client";

import { ChangeEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCan } from "@/components/permissions";
import { createClient } from "@/lib/supabase/client";
import { formatActivityTime } from "@/lib/activity-log";
import { PATIENT_FILE_ACCEPT, PATIENT_FILE_BUCKET, PATIENT_FILE_MAX_BYTES, formatFileSize, isAllowedPatientFileType } from "@/lib/patient-files";
import { PatientFile, Profile } from "@/types";
import { createPatientFileUploads, deletePatientFile, getPatientFileLink, recordPatientFiles, renamePatientFile } from "../file-actions";
import { RowMenu } from "./Menu";
import { Section } from "./bits";
import { useT } from "@/i18n/client";

/** A plain list of the patient's files: upload several at once (a phone opens its camera
 * from the picker), open, rename, delete. Rename/delete: whoever uploaded it, or an admin. */
export function FilesCard({
  patientId,
  files,
  profiles,
  currentUserId,
}: {
  patientId: string;
  files: PatientFile[];
  profiles: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const canView = useCan("files.view");
  const canManage = useCan("files.manage");
  const canChangeAny = useCan("files.delete");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name || t("Someone");

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(e.target.files ?? [])];
    e.target.value = "";
    if (chosen.length === 0) return;
    const tooBig = chosen.find((f) => f.size > PATIENT_FILE_MAX_BYTES);
    if (tooBig) return showToast(t("{name} is over 20 MB", { name: tooBig.name }), "error");
    const wrongType = chosen.find((f) => !isAllowedPatientFileType(f.type));
    if (wrongType) return showToast(t("{name}: images, PDF, Office documents and text files only", { name: wrongType.name }), "error");

    setUploading(chosen.length === 1 ? chosen[0].name : t("{n} files", { n: chosen.length }));
    try {
      const tickets = await createPatientFileUploads(
        patientId,
        chosen.map((f) => ({ name: f.name, size: f.size, type: f.type }))
      );
      const storage = createClient().storage.from(PATIENT_FILE_BUCKET);
      const done: { name: string; path: string; mime: string | null }[] = [];
      const failed: string[] = [];
      await Promise.all(
        tickets.map(async (ticket, i) => {
          const file = chosen[i];
          const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
          if (error) failed.push(file.name);
          else done.push({ name: file.name, path: ticket.path, mime: file.type || null });
        })
      );
      if (done.length > 0) await recordPatientFiles(patientId, done);
      if (failed.length > 0) showToast(t("Couldn't upload {names}", { names: failed.join(", ") }), "error");
      else showToast(done.length === 1 ? t("File uploaded ✓") : t("{n} files uploaded ✓", { n: done.length }));
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("Upload failed"), "error");
    } finally {
      setUploading(null);
    }
  }

  function open(file: PatientFile, download = false) {
    // open the tab now (a popup blocker only allows it straight from the click), then point it at the link
    const tab = download ? null : window.open("about:blank", "_blank");
    startTransition(async () => {
      try {
        const url = await getPatientFileLink(file.id, download);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (err) {
        tab?.close();
        showToast(err instanceof Error ? err.message : t("Couldn't open the file"), "error");
      }
    });
  }

  function run(action: () => Promise<void>, done: string) {
    startTransition(async () => {
      try {
        await action();
        showToast(done);
        setRenaming(null);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("Something went wrong"), "error");
      }
    });
  }

  if (!canView) return null;

  return (
    <Section
      title={t("Files")}
      aside={files.length > 0 && <span className="text-xs text-slate-500">{files.length}</span>}
      actions={
        canManage && (
          <>
            <input ref={inputRef} type="file" multiple accept={PATIENT_FILE_ACCEPT} onChange={upload} className="hidden" />
            <Button type="button" size="sm" variant="secondary" disabled={!!uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? t("Uploading…") : `+ ${t("Upload")}`}
            </Button>
          </>
        )
      }
    >
      {uploading && <p className="text-xs text-slate-500">{t("Uploading {name}…", { name: uploading })}</p>}
      {files.length === 0 ? (
        <p className="text-sm text-slate-400">
          {t("No files yet.")}
          {canManage && ` ${t("X-rays, treatment plans, passports — images, PDF or Office documents up to 20 MB.")}`}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {files.map((f) =>
            renaming === f.id ? (
              <li key={f.id} className="py-2">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "");
                    run(() => renamePatientFile(f.id, name), t("File renamed ✓"));
                  }}
                >
                  <Input name="name" defaultValue={f.name} maxLength={200} autoFocus required aria-label={t("File name")} />
                  <Button type="button" size="sm" variant="secondary" onClick={() => setRenaming(null)}>
                    {t("Cancel")}
                  </Button>
                  <Button type="submit" size="sm" disabled={pending}>
                    {t("Save")}
                  </Button>
                </form>
              </li>
            ) : (
              <li key={f.id} className="flex items-center gap-2.5 py-2 text-sm">
                <button type="button" onClick={() => open(f)} className="min-w-0 grow text-left" title={t("Open")}>
                  <span className="block truncate font-semibold text-teal-800 hover:underline">{f.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {formatFileSize(f.size)} · {nameOf(f.uploaded_by)} · {formatActivityTime(f.created_at)}
                  </span>
                </button>
                <RowMenu
                  label={t("File actions")}
                  items={[
                    { label: t("Open"), onSelect: () => open(f) },
                    { label: t("Download"), onSelect: () => open(f, true) },
                    ...((canManage && f.uploaded_by === currentUserId) || canChangeAny
                      ? [
                          { label: t("Rename"), onSelect: () => setRenaming(f.id) },
                          {
                            label: t("Delete file…"),
                            danger: true,
                            divider: true,
                            disabled: pending,
                            onSelect: () => {
                              if (confirm(t("Delete {name}? This can't be undone.", { name: f.name }))) run(() => deletePatientFile(f.id), t("File deleted"));
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </li>
            )
          )}
        </ul>
      )}
    </Section>
  );
}
