import { Profile, Seller } from "@/types";

export function sellerLabel(s: Pick<Seller, "name"> | null | undefined): string {
  return s?.name?.trim() || "Unnamed seller";
}

/** Seller id → display name. */
export function sellerNameMap(sellers: Seller[]): Map<string, string> {
  return new Map(sellers.map((s) => [s.id, sellerLabel(s)]));
}

/** Names for anything an activity entry can point at: accounts (who did it) and sellers
 * (who a patient was handed to — possibly someone without an account). */
export function peopleNameMap(profiles: Profile[], sellers: Seller[]): Map<string, string> {
  const map = sellerNameMap(sellers);
  for (const p of profiles) map.set(p.id, p.display_name || "Unnamed seller");
  return map;
}

/** Case- and space-insensitive, so "ahmet " finds "Ahmet" instead of creating a second one. */
export function findSellerByName<T extends Pick<Seller, "name">>(sellers: T[], name: string): T | undefined {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!key) return undefined;
  return sellers.find((s) => (s.name ?? "").trim().replace(/\s+/g, " ").toLowerCase() === key);
}

/** Who shows up in a seller picker: active sellers, plus the current one even if inactive. */
export function pickableSellers(sellers: Seller[], currentId?: string | null): Seller[] {
  return sellers
    .filter((s) => s.is_active || s.id === currentId)
    .sort((a, b) => sellerLabel(a).localeCompare(sellerLabel(b)));
}
