"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const tier1_threshold = Number(formData.get("tier1_threshold"));
  const tier1_rate = Number(formData.get("tier1_rate")) / 100;
  const tier2_threshold = Number(formData.get("tier2_threshold"));
  const tier2_rate = Number(formData.get("tier2_rate")) / 100;
  const tier3_rate = Number(formData.get("tier3_rate")) / 100;
  const fixed_monthly_payment = Number(formData.get("fixed_monthly_payment"));
  const show_try = formData.get("show_try") === "on";
  const currency = String(formData.get("currency") ?? "GBP");

  if (!Number.isFinite(tier1_threshold) || tier1_threshold < 0 || !Number.isFinite(tier2_threshold) || tier2_threshold < 0) {
    throw new Error("Thresholds must be positive numbers");
  }
  if (tier2_threshold <= tier1_threshold) {
    throw new Error("Tier 2 threshold must be greater than tier 1 threshold");
  }
  if (!Number.isFinite(tier1_rate) || !Number.isFinite(tier2_rate) || !Number.isFinite(tier3_rate)) {
    throw new Error("Rates must be numbers");
  }
  if (!Number.isFinite(fixed_monthly_payment) || fixed_monthly_payment < 0) {
    throw new Error("Fixed monthly payment must be a positive number");
  }

  const { error } = await supabase.from("settings").upsert({
    user_id: user.id,
    tier1_threshold,
    tier1_rate,
    tier2_threshold,
    tier2_rate,
    tier3_rate,
    fixed_monthly_payment,
    show_try,
    currency,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/patients");
  revalidatePath("/projections");
}
