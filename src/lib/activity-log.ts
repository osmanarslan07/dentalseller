import { SupabaseClient } from "@supabase/supabase-js";

/** Best-effort audit log — a logging failure should never break the action it's recording. */
export async function logActivity(
  supabase: SupabaseClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: string
): Promise<void> {
  try {
    await supabase
      .from("activity_log")
      .insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, detail });
  } catch (err) {
    console.error("Activity log write failed:", err);
  }
}
