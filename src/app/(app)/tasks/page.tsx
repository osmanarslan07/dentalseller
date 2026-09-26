import { createClient } from "@/lib/supabase/server";
import { getTasks, getPatientNames } from "@/lib/data";
import { TasksClient } from "./TasksClient";
import { requirePagePermission } from "@/lib/permissions";

export default async function TasksPage() {
  await requirePagePermission("tasks.use");
  const supabase = await createClient();
  const tasks = await getTasks(supabase);
  // only the patients these tasks point at; the task form searches the rest as you type
  const names = await getPatientNames(supabase, tasks.map((t) => t.patient_id));

  return <TasksClient tasks={tasks} patientNames={Object.fromEntries(names)} />;
}
