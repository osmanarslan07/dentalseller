import { createAdminClient } from "@/lib/supabase/admin";

/** Throws if the clinic's plan has no room for one more active account. Uses the service
 * role because clinic_billing is superadmin-only; only the limit and a count are read. */
export async function assertSeatAvailable(clinicId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: billing, error: billingError }, { count, error: countError }] = await Promise.all([
    admin.from("clinic_billing").select("seat_limit").eq("clinic_id", clinicId).maybeSingle(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("is_active", true),
  ]);
  if (billingError) throw new Error(billingError.message);
  if (countError) throw new Error(countError.message);

  const limit = billing?.seat_limit as number | null | undefined;
  if (limit && (count ?? 0) >= limit) {
    throw new Error(
      `Your clinic's plan allows ${limit} active account${limit === 1 ? "" : "s"}, and all are in use. Deactivate someone or contact DentalSeller to add more.`
    );
  }
}
