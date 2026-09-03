import { createClient } from "@/lib/supabase/server";
import { getTasks, getPatients } from "@/lib/data";
import { TasksClient } from "./TasksClient";

export default async function TasksPage() {
  const supabase = await createClient();
  const [tasks, patients] = await Promise.all([getTasks(supabase), getPatients(supabase)]);

  return <TasksClient tasks={tasks} patients={patients.map((p) => ({ id: p.id, name: p.name }))} />;
}
