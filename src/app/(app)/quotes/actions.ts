"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeQuoteSplit } from "@/lib/quote-templates";
import { diffFields, logActivity } from "@/lib/activity-log";
import { QuoteInput } from "@/types";

const QUOTE_AUDIT_FIELDS: { key: keyof QuoteInput; label: string }[] = [
  { key: "name", label: "name" },
  { key: "label", label: "label" },
  { key: "status", label: "status" },
  { key: "intro_text", label: "intro text" },
  { key: "inclusions", label: "inclusions" },
  { key: "total_price", label: "total" },
  { key: "currency", label: "currency" },
  { key: "split_mode", label: "split mode" },
  { key: "deposit_percent", label: "deposit %" },
  { key: "first_visit_amount", label: "first visit amount" },
  { key: "include_bone_graft_note", label: "bone graft note included" },
  { key: "bone_graft_note", label: "bone graft note" },
  { key: "notes", label: "notes" },
  { key: "komo_reference", label: "komo reference" },
];

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
    label: str("label"),
    status: (formData.get("status") as QuoteInput["status"]) || "draft",
    intro_text: str("intro_text"),
    inclusions: str("inclusions"),
    total_price: num("total_price"),
    currency: String(formData.get("currency") ?? "GBP"),
    split_mode: (formData.get("split_mode") as QuoteInput["split_mode"]) || "percent",
    deposit_percent: num("deposit_percent") ?? 60,
    first_visit_amount: num("first_visit_amount"),
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

  await logActivity(supabase, user.id, "quote_created", "quote", data.id, input.name);

  revalidatePath("/quotes");
  return data.id as string;
}

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { data: before } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();

  const { error } = await supabase.from("quotes").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  if (before) {
    const changes = diffFields(before, input, QUOTE_AUDIT_FIELDS);
    if (changes) await logActivity(supabase, user.id, "quote_updated", "quote", id, changes);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}/offer`);
}

export async function duplicateQuote(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: quote, error: fetchError } = await supabase.from("quotes").select("*").eq("id", id).single();
  if (fetchError) throw new Error(fetchError.message);

  const {
    id: _id,
    created_at: _created_at,
    updated_at: _updated_at,
    converted_patient_id: _converted_patient_id,
    user_id: _user_id,
    ...rest
  } = quote;
  void _id;
  void _created_at;
  void _updated_at;
  void _converted_patient_id;
  void _user_id;

  const { data, error } = await supabase
    .from("quotes")
    .insert({ ...rest, status: "draft", user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "quote_duplicated", "quote", data.id, quote.name);

  revalidatePath("/quotes");
  return data.id as string;
}

export async function deleteQuote(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Grab the name before it's gone — the log has to be self-contained since the quote row won't exist anymore.
  const { data: quote } = await supabase.from("quotes").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "quote_deleted", "quote", id, quote?.name ?? undefined);

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

  const { first, second } = computeQuoteSplit(
    quote.total_price,
    quote.split_mode,
    quote.deposit_percent,
    quote.first_visit_amount
  );
  const letterItems = (quote.inclusions || "")
    .split("\n")
    .map((s: string) => s.replace(/^-\s*/, "").trim())
    .filter(Boolean)
    .join(", ");

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      responsible_seller_id: user.id,
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

  // other draft/sent quotes for the same patient name are now moot — decline them
  await supabase
    .from("quotes")
    .update({ status: "declined" })
    .eq("user_id", user.id)
    .eq("name", quote.name)
    .neq("id", id)
    .in("status", ["draft", "sent"]);

  await logActivity(supabase, user.id, "patient_created", "patient", patient.id, quote.name);
  await logActivity(supabase, user.id, "quote_converted", "quote", id, patient.id);

  revalidatePath("/quotes");
  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
  return patient.id as string;
}
