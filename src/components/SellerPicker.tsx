"use client";

import { Input, Select } from "@/components/ui";
import { findSellerByName, pickableSellers, sellerLabel } from "@/lib/sellers";
import { Seller } from "@/types";

const NEW = "__new";

/** An existing seller, or (newName set) a name typed for a seller without an account. */
export interface SellerPick {
  sellerId: string;
  newName: string | null;
}

/** Pick who gets credit for a sale — anyone on the seller list, account or not — or, when
 * `allowNew`, type the name of a seller who isn't on it yet. A typed name that matches an
 * existing seller is reused (the server does the same check). With `formFields`, the choice
 * is also posted as `seller_id` / `new_seller_name`. */
export function SellerPicker({
  sellers,
  value,
  onChange,
  currentUserId,
  allowNew,
  disabled,
  autoFocus,
  formFields,
}: {
  sellers: Seller[];
  value: SellerPick;
  onChange: (next: SellerPick) => void;
  currentUserId: string;
  allowNew: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  formFields?: boolean;
}) {
  const options = pickableSellers(sellers, value.sellerId);
  const typing = value.newName != null;
  const match = typing ? findSellerByName(sellers, value.newName ?? "") : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={typing ? NEW : value.sellerId}
        onChange={(e) =>
          onChange(e.target.value === NEW ? { sellerId: value.sellerId, newName: "" } : { sellerId: e.target.value, newName: null })
        }
        disabled={disabled}
        autoFocus={autoFocus && !typing}
        aria-label="Seller"
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {sellerLabel(s)}
            {s.id === currentUserId ? " (you)" : s.profile_id ? "" : " · no account"}
          </option>
        ))}
        {allowNew && <option value={NEW}>+ New seller (no account)…</option>}
      </Select>
      {typing && (
        <>
          <Input
            value={value.newName ?? ""}
            onChange={(e) => onChange({ sellerId: value.sellerId, newName: e.target.value })}
            placeholder="Seller's name, e.g. Ahmet"
            maxLength={80}
            disabled={disabled}
            autoFocus
            required
            aria-label="New seller's name"
          />
          <p className="text-xs text-slate-500">
            {match
              ? `Already on the list as “${sellerLabel(match)}” — that seller will be used.`
              : "Added to your seller list. They don't need an account; you can link one later in Settings → Team."}
          </p>
        </>
      )}
      {formFields && (
        <>
          <input type="hidden" name="seller_id" value={typing ? "" : value.sellerId} />
          <input type="hidden" name="new_seller_name" value={typing ? value.newName ?? "" : ""} />
        </>
      )}
    </div>
  );
}
