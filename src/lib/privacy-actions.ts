"use server";

import { createClient } from "@/lib/supabase/server";
import { getActingUser } from "@/lib/viewer";

export async function setHideEarnings(hidden: boolean) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { error } = await supabase.from("settings").upsert({
    user_id: user.id,
    hide_earnings: hidden,
  });

  if (error) throw new Error(error.message);
}

export async function setCelebrationSound(enabled: boolean) {
  const supabase = await createClient();
  const user = await getActingUser();

  const { error } = await supabase.from("settings").upsert({
    user_id: user.id,
    celebration_sound: enabled,
  });

  if (error) throw new Error(error.message);
}
