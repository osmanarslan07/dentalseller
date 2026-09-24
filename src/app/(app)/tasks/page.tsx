import { createClient } from "@/lib/supabase/server";
import { getTasks, getPatients } from "@/lib/data";
import { TasksClient } from "./TasksClient";
import { requirePagePermission } from "@/lib/permissions";

export default async function TasksPage() {
  await requirePagePermission("tasks.use");
  const supabase = await createClient();
  const [tasks, patients] = await Promise.all([getTasks(supabase), getPatients(supabase)]);

  return <TasksClient tasks={tasks} patients={patients.map((p) => ({ id: p.id, name: p.name }))} />;
}
