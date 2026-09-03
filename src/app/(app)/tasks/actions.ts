"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TaskInput, TaskStatus } from "@/types";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.title) throw new Error("Title is required");
  if (!input.due_date) throw new Error("Due date is required");

  const { error } = await supabase.from("tasks").insert({ ...input, user_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient();
  const input = parseInput(formData);
  if (!input.title) throw new Error("Title is required");
  if (!input.due_date) throw new Error("Due date is required");

  // editing due date/time re-arms the reminder
  const { error } = await supabase.from("tasks").update({ ...input, notified_at: null }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}
