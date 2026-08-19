/** Default copy pre-filled into a new quote — fully editable per patient in the form. */
export const DEFAULT_QUOTE_INTRO =
  "Thank you very much for the photos. According to photos it appears that the best approach will be replacing all teeth with the method what we called All on 6. We planned to remove remaining teeth and replace them by using 6 implants and 12 zirconium crowns on each jaw total of 12 implants and 24 crowns. With this method we will be able to renew whole teeth structure and your smile with more than 20 shades of white and styles to choose.";

export const DEFAULT_QUOTE_INCLUSIONS = [
  "12 High-Quality Dental Implants",
  "24 German Dental Direkt Zirconium Crowns reinforced with a Titanium Bar",
  "Fixed Temporary Teeth",
  "Free Hotel Accommodation",
  "Free VIP Transfers",
  "Free Night Guard & Medication",
].join("\n");

/**
 * First-visit / second-visit split for a quote's total price. Second visit absorbs the rounding remainder.
 * In "percent" mode the first-visit amount is derived from depositPercent; in "amount" mode it's typed
 * directly and the percentage (if needed for display) can be derived from the result.
 */
export function computeQuoteSplit(
  totalPrice: number | null,
  splitMode: "percent" | "amount",
  depositPercent: number,
  firstVisitAmount: number | null
) {
  if (totalPrice == null) return { first: null as number | null, second: null as number | null };

  if (splitMode === "amount") {
    if (firstVisitAmount == null) return { first: null as number | null, second: null as number | null };
    const first = firstVisitAmount;
    const second = Math.round((totalPrice - first) * 100) / 100;
    return { first, second };
  }

  const first = Math.round(totalPrice * (depositPercent / 100) * 100) / 100;
  const second = Math.round((totalPrice - first) * 100) / 100;
  return { first, second };
}

export const DEFAULT_QUOTE_BONE_GRAFT_NOTE =
  "To ensure your implants have a strong and permanent foundation, we will perform a detailed 3D CT scan upon your arrival.\n\nBecause natural bone density reduces over time when teeth are missing, some patients require a bone graft or sinus lift. If our surgeon sees that your case requires this extra support, we will explain the options and any extra costs clearly during your consultation.";
