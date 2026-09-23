import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { monitoredCron } from "@/lib/job-runs";
import { getEnvChatsClinicId, getFallbackChatId, sendTelegramMessageToMany } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string;
  due_time: string | null;
  patient_name: string | null;
  patients: { name: string } | null;
}

export const GET = monitoredCron("task-reminders", async (request: NextRequest) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  // due_date/due_time are entered as Europe/Istanbul wall-clock (clinic timezone, fixed UTC+3, no DST)
  const TZ_OFFSET = "+03:00";
  const today = new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);

  // due today with a time that's already passed, or due on an earlier date at all — either way it's due
  const { data, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, notes, due_date, due_time, patient_name, patients(name)")
    .eq("status", "pending")
    .is("notified_at", null)
    .lte("due_date", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []).filter((t) => {
    if (t.due_date < today) return true;
    if (!t.due_time) return t.due_date <= today;
    const dueInstant = new Date(`${t.due_date}T${t.due_time}:00${TZ_OFFSET}`);
    return dueInstant.getTime() <= now.getTime();
  }) as unknown as TaskRow[];

  if (due.length === 0) {
    return NextResponse.json({ sent: false, reason: "No tasks due" });
  }

  const dueByOwner = new Map<string, TaskRow[]>();
  for (const t of due) {
    const list = dueByOwner.get(t.user_id) ?? [];
    list.push(t);
    dueByOwner.set(t.user_id, list);
  }

  const [{ data: profiles }, { data: clinics }, envChatsClinicId] = await Promise.all([
    supabase.from("profiles").select("id, telegram_chat_id, clinic_id"),
    supabase.from("clinics").select("id, is_active"),
    getEnvChatsClinicId(),
  ]);
  const ownerById = new Map(
    (profiles ?? []).map((p) => [p.id, { chat: p.telegram_chat_id as string | null, clinicId: p.clinic_id as string | null }])
  );
  const activeClinics = new Set((clinics ?? []).filter((c) => c.is_active).map((c) => c.id as string));

  // A suspended clinic (or an owner with no clinic) gets nothing — and those tasks aren't
  // marked notified, so they still go out if the clinic is reactivated.
  const sendable = [...dueByOwner.entries()].filter(([ownerId]) => {
    const clinicId = ownerById.get(ownerId)?.clinicId;
    return !!clinicId && activeClinics.has(clinicId);
  });

  await Promise.all(
    sendable.map(async ([ownerId, tasks]) => {
      const owner = ownerById.get(ownerId);
      const chatIds = new Set<string>();
      if (owner?.chat) chatIds.add(owner.chat);
      // The env fallback chat belongs to one clinic only — never another clinic's tasks.
      const fallback = getFallbackChatId(owner?.clinicId ?? null, envChatsClinicId);
      if (fallback) chatIds.add(fallback);
      if (chatIds.size === 0) return;

      const lines = tasks.map((t) => {
        const patient = t.patient_name || t.patients?.name;
        const when = t.due_time ? `${t.due_date} ${t.due_time}` : t.due_date;
        return [
          `⏰ <b>${t.title}</b>`,
          patient ? ` — ${patient}` : "",
          ` (${when})`,
          t.notes ? `\n${t.notes}` : "",
        ].join("");
      });

      await sendTelegramMessageToMany([...chatIds], `<b>Task reminders</b>\n\n${lines.join("\n\n")}`);
    })
  );

  const sentTaskIds = sendable.flatMap(([, tasks]) => tasks.map((t) => t.id));
  if (sentTaskIds.length === 0) {
    return NextResponse.json({ sent: false, reason: "Only tasks at suspended clinics were due" });
  }

  await supabase.from("tasks").update({ notified_at: now.toISOString() }).in("id", sentTaskIds);

  return NextResponse.json({ sent: true, count: sentTaskIds.length });
});
