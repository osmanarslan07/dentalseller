"use server";

import { createClient } from "@/lib/supabase/server";

/** Best-effort "I'm here" ping for the platform area's online/last-seen view. Throttled in
 * the DB (touch_presence), so extra calls are harmless. */
export async function heartbeat(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("touch_presence");
  } catch (err) {
    console.error("Presence heartbeat failed:", err);
  }
}
