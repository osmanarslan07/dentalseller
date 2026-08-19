"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { QuoteInput } from "@/types";

function parseInput(formData: FormData): QuoteInput {
  const num = (key: string) => {
    const v = formData.get(key);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (key: string) => {
    const v = formData.get(key);
    return v == null || v === "" ? null : String(v);
  };

  return {
    name: String(formData.get("name") ?? "").trim(),
    status: (formData.get("status") as QuoteInput["status"]) || "draft",
    intro_text: str("intro_text"),
    inclusions: str("inclusions"),
    total_price: num("total_price"),
    currency: String(formData.get("currency") ?? "GBP"),
    deposit_percent: num("deposit_percent") ?? 60,
    include_bone_graft_note: formData.get("include_bone_graft_note") === "on",
    bone_graft_note: str("bone_graft_note"),
    notes: str("notes"),
    komo_reference: str("komo_reference"),
  };
}

export async function createQuote(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { data, error } = await supabase
    .from("quotes")
    .insert({ ...input, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  return data.id as string;
}

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createClient();
  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { error } = await supabase.from("quotes").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}/offer`);
}

export async function deleteQuote(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
}

/** Turns an accepted quote into a real patient record once travel gets scheduled — quote stays as a record of the offer sent. */
export async function convertQuoteToPatient(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single();
  if (quoteError) throw new Error(quoteError.message);

  const { first, second } = computeQuoteSplit(quote.total_price, quote.deposit_percent);
  const letterItems = (quote.inclusions || "")
    .split("\n")
    .map((s: string) => s.replace(/^-\s*/, "").trim())
    .filter(Boolean)
    .join(", ");

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      user_id: user.id,
      name: quote.name,
      treatment: letterItems.split(",")[0]?.trim() || null,
      letter_treatment_items: letterItems || null,
      confirmation_date: new Date().toISOString().slice(0, 10),
      needs_visit2: second != null && second > 0,
      visit1_expected: first,
      visit2_expected: second,
      notes: quote.notes,
      komo_reference: quote.komo_reference,
    })
    .select("id")
    .single();
  if (patientError) throw new Error(patientError.message);

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "accepted", converted_patient_id: patient.id })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/quotes");
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
  return patient.id as string;
}
