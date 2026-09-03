"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Task } from "@/types";
import { createTask, updateTask } from "./actions";

export function TaskFormModal({
  open,
  onClose,
  task,
  patients,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  patients: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [patientId, setPatientId] = useState(task?.patient_id ?? "");
  const isEdit = !!task;
  const { showToast } = useToast();

  function handleRequestClose() {
    if (isDirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && task) {
          await updateTask(task.id, formData);
          showToast("Task saved ✓");
        } else {
          await createTask(formData);
          showToast("Task created ✓");
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleRequestClose} title={isEdit ? "Edit task" : "New task"}>
      <form action={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-5">
        <div>
          <Label>Title</Label>
          <Input name="title" required defaultValue={task?.title} placeholder="Call about visit dates" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Due date</Label>
            <Input type="date" name="due_date" required defaultValue={task?.due_date ?? ""} />
          </div>
          <div>
            <Label>Due time (optional)</Label>
            <Input type="time" name="due_time" defaultValue={task?.due_time ?? ""} />
            <p className="mt-1 text-xs text-slate-400">Leave blank to send the reminder that morning.</p>
          </div>
        </div>

        <div>
          <Label>Patient (optional)</Label>
          <Select name="patient_id" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">— None —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {!patientId && (
            <Input
              name="patient_name"
              defaultValue={task?.patient_id ? "" : task?.patient_name ?? ""}
              placeholder="Or type a name — no patient record needed"
              className="mt-2"
            />
          )}
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Textarea name="notes" rows={3} defaultValue={task?.notes ?? ""} placeholder="Any extra detail…" />
        </div>

        {isEdit && (
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={task?.status ?? "pending"}>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </Select>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleRequestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
