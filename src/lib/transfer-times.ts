/** Suggested pickup times — used by "Suggest transfers" and when a new transfer's type is
 * picked, so both always agree. Arrival pickup = the flight's landing time (as entered). */

/** Hotel → clinic on the visit day. */
export const LOCAL_PICKUP_TIME = "10:00";

/** How long before a departing flight the car should pick the patient up. */
export const DEPARTURE_LEAD_HOURS = 3;

const pad = (n: number) => String(n).padStart(2, "0");

/** Pickup for a departure: the flight time minus DEPARTURE_LEAD_HOURS — the day before if that
 * crosses midnight (a 01:30 flight → 22:30 the previous evening). No flight time → no pickup
 * time, just the flight's date. */
export function departurePickup(
  flightDate: string | null,
  flightTime: string | null
): { date: string | null; time: string | null } {
  if (!flightDate) return { date: null, time: null };
  const m = flightTime?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return { date: flightDate, time: null };

  const [y, mo, d] = flightDate.split("-").map(Number);
  // local-time Date built from parts, never parsed from a string — no UTC day drift
  const at = new Date(y, mo - 1, d, Number(m[1]), Number(m[2]));
  at.setHours(at.getHours() - DEPARTURE_LEAD_HOURS);
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}
