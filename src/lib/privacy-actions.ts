"use server";

import { createClient } from "@/lib/supabase/server";

export async function setHideEarnings(hidden: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("settings").upsert({
    user_id: user.id,
    hide_earnings: hidden,
  });

  if (error) throw new Error(error.message);
}
