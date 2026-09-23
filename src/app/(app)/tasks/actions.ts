"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { diffFields, logActivity } from "@/lib/activity-log";
import { Celebration, TaskInput, TaskStatus } from "@/types";
import { getActingUser } from "@/lib/viewer";

const TASK_AUDIT_FIELDS: { key: keyof TaskInput; label: string }[] = [
  { key: "title", label: "title" },
  { key: "notes", label: "notes" },
  { key: "due_date", label: "due date" },
  { key: "due_time", label: "due time" },
  { key: "patient_name", label: "linked patient" },
  { key: "status", label: "status" },
];

function parseInput(formData: FormData): TaskInput {
  const str = (key: string) => {
    const v = formData.get(key);
    return v == null || v === "" ? null : String(v);
  };

  return {
    title: String(formData.get("title") ?? "").trim(),
    notes: str("notes"),
    due_date: String(formData.get("due_date") ?? ""),
    due_time: str("due_time"),
    patient_id: str("patient_id"),
    patient_name: str("patient_name"),
    status: (formData.get("status") as TaskStatus) || "pending",
  };
}

export async function createTask(formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseInput(formData);
  if (!input.title) throw new Error("Title is required");
  if (!input.due_date) throw new Error("Due date is required");

  const { data, error } = await supabase.from("tasks").insert({ ...input, user_id: user.id }).select("id").single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "task_created", "task", data.id, input.title);

  revalidatePath("/tasks");
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getActingUser();

  const input = parseInput(formData);
  if (!input.title) throw new Error("Title is required");
  if (!input.due_date) throw new Error("Due date is required");

  const { data: before } = await supabase
    .from("tasks")
    .select("title, notes, due_date, due_time, patient_id, patient_name, status")
    .eq("id", id)
    .maybeSingle();

  // editing due date/time re-arms the reminder
  const { error } = await supabase.from("tasks").update({ ...input, notified_at: null }).eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    const changes = diffFields(before, input, TASK_AUDIT_FIELDS);
    if (changes) await logActivity(supabase, user.actorId, "task_updated", "task", id, changes);
  }

  revalidatePath("/tasks");
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "task_status_changed", "task", id, status);

  revalidatePath("/tasks");

  const celebration: Celebration | null = status === "done" ? { kind: "toast", message: "✅ Task done!" } : null;
  return { celebration };
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const user = await getActingUser();

  // Grab the title before it's gone — the log has to be self-contained since the task row won't exist anymore.
  const { data: task } = await supabase.from("tasks").select("title").eq("id", id).maybeSingle();

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.actorId, "task_deleted", "task", id, task?.title ?? undefined);

  revalidatePath("/tasks");
}
