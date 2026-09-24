import { SupabaseClient } from "@supabase/supabase-js";
import { getSellers } from "@/lib/data";
import { findSellerByName } from "@/lib/sellers";

/** What a seller picker sends: an existing seller, or a name typed for a new one. */
export interface SellerChoice {
  sellerId?: string | null;
  newSellerName?: string | null;
}

export function sellerChoiceFromForm(formData: FormData): SellerChoice {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return { sellerId: get("seller_id"), newSellerName: get("new_seller_name") };
}

/** Turns a picker choice into a seller id. A typed name that matches an existing seller
 * (ignoring case and spacing) reuses that seller rather than creating a duplicate; otherwise
 * a seller without an account is created — which only an admin may do (RLS). */
export async function resolveSellerChoice(
  supabase: SupabaseClient,
  choice: SellerChoice,
  fallbackId: string
): Promise<{ id: string; hasAccount: boolean }> {
  const sellers = await getSellers(supabase);
  const name = choice.newSellerName?.trim().replace(/\s+/g, " ");

  let seller = name ? findSellerByName(sellers, name) : sellers.find((s) => s.id === (choice.sellerId || fallbackId));
  if (!seller && name) {
    if (name.length > 80) throw new Error("That name is too long");
    const { data, error } = await supabase.from("sellers").insert({ name }).select("id, name, profile_id, is_active, created_at").single();
    if (error) {
      throw new Error(/row-level security/i.test(error.message) ? "Only an admin can add a new seller" : error.message);
    }
    seller = data;
  }
  if (!seller) throw new Error("Seller not found");
  return { id: seller.id, hasAccount: seller.profile_id != null };
}
