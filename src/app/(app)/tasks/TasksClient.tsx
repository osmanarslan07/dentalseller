"use client";

import { useMemo, useState, useTransition } from "react";
import { Task } from "@/types";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { TaskFormModal } from "./TaskFormModal";
import { deleteTask, setTaskStatus } from "./actions";

function formatDue(date: string, time: string | null) {
  const d = new Date(`${date}T00:00:00`);
  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  return time ? `${label}, ${time}` : label;
}

function isOverdue(task: Task) {
  if (task.status !== "pending") return false;
  const due = new Date(`${task.due_date}T${task.due_time ?? "23:59"}`);
  return due.getTime() < Date.now();
}

export function TasksClient({
  tasks,
  patients,
}: {
  tasks: Task[];
  patients: { id: string; name: string }[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  const { pendingTasks, doneTasks } = useMemo(
    () => ({
      pendingTasks: tasks.filter((t) => t.status === "pending"),
      doneTasks: tasks.filter((t) => t.status === "done"),
    }),
    [tasks]
  );

  function handleToggle(task: Task) {
    setBusyId(task.id);
    startTransition(async () => {
      try {
        await setTaskStatus(task.id, task.status === "pending" ? "done" : "pending");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to update task", "error");
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    setBusyId(id);
    startTransition(async () => {
      try {
        await deleteTask(id);
        showToast("Task deleted");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete task", "error");
      } finally {
        setBusyId(null);
      }
    });
  }

  function TaskRow({ task }: { task: Task }) {
    const overdue = isOverdue(task);
    const patientLabel = task.patient_name || patients.find((p) => p.id === task.patient_id)?.name;
    return (
      <Card className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          checked={task.status === "done"}
          disabled={busyId === task.id}
          onChange={() => handleToggle(task)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
        />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setEditingTask(task); setModalOpen(true); }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
              {task.title}
            </span>
            {patientLabel && <Badge tone="blue">{patientLabel}</Badge>}
            {overdue && <Badge tone="amber">Overdue</Badge>}
          </div>
          <div className="mt-1 text-xs text-slate-500">{formatDue(task.due_date, task.due_time)}</div>
          {task.notes && <p className="mt-1 text-sm text-slate-500">{task.notes}</p>}
        </div>
        <button
          disabled={busyId === task.id}
          onClick={() => handleDelete(task.id)}
          className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">Reminders sent to Telegram when they come due</p>
        </div>
        <Button
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
        >
          + New task
        </Button>
      </div>

      <div className="space-y-3">
        {pendingTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        {pendingTasks.length === 0 && (
          <div className="py-10 text-center text-slate-400">No pending tasks.</div>
        )}
      </div>

      {doneTasks.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">
            Done ({doneTasks.length})
          </summary>
          <div className="mt-3 space-y-3">
            {doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </details>
      )}

      <TaskFormModal
        key={modalOpen ? editingTask?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        patients={patients}
      />
    </div>
  );
}
