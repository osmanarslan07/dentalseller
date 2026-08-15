"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PatientInput } from "@/types";

function parseInput(formData: FormData): PatientInput {
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
    treatment: str("treatment"),
    letter_treatment_items: str("letter_treatment_items"),
    confirmation_date: str("confirmation_date"),
    needs_visit2: formData.get("needs_visit2") === "on",
    visit1_date: str("visit1_date"),
    visit1_expected: num("visit1_expected"),
    visit1_actual: num("visit1_actual"),
    visit1_status: (formData.get("visit1_status") as "upcoming" | "completed") || "upcoming",
    visit2_date: str("visit2_date"),
    visit2_expected: num("visit2_expected"),
    visit2_actual: num("visit2_actual"),
    visit2_status: (formData.get("visit2_status") as "upcoming" | "completed") || "upcoming",
    notes: str("notes"),
    komo_reference: str("komo_reference"),
    visit1_arrival_date: str("visit1_arrival_date"),
    visit1_arrival_time: str("visit1_arrival_time"),
    visit1_arrival_flight_no: str("visit1_arrival_flight_no"),
    visit1_departure_date: str("visit1_departure_date"),
    visit1_departure_time: str("visit1_departure_time"),
    visit1_departure_flight_no: str("visit1_departure_flight_no"),
    visit1_hotel_name: str("visit1_hotel_name"),
    visit1_room_type: str("visit1_room_type"),
    visit2_arrival_date: str("visit2_arrival_date"),
    visit2_arrival_time: str("visit2_arrival_time"),
    visit2_arrival_flight_no: str("visit2_arrival_flight_no"),
    visit2_departure_date: str("visit2_departure_date"),
    visit2_departure_time: str("visit2_departure_time"),
    visit2_departure_flight_no: str("visit2_departure_flight_no"),
    visit2_hotel_name: str("visit2_hotel_name"),
    visit2_room_type: str("visit2_room_type"),
  };
}

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { error } = await supabase.from("patients").insert({ ...input, user_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient();
  const input = parseInput(formData);
  if (!input.name) throw new Error("Name is required");

  const { error } = await supabase.from("patients").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}

export async function deletePatient(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/patients");
  revalidatePath("/");
  revalidatePath("/projections");
}
