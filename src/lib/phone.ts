/** Patient phones are kept in one international format ("+447700900123") so incoming
 * WhatsApp messages can later be matched to the right patient. Spaces, dashes, dots and
 * brackets are dropped and a leading 00 becomes +; a number without its country code is
 * refused rather than guessed, since patients come from many countries. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/[\s\-.()/]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) {
    throw new Error("Enter the phone with its country code, e.g. +44 7700 900123");
  }
  return digits;
}
