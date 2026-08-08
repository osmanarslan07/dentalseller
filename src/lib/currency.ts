/** Approximate GBP/USD/EUR -> TRY rate, cached for 24h. No key required. */
export async function getTryRate(base: string): Promise<number | null> {
  if (base === "TRY") return 1;

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=TRY`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.rates?.TRY === "number" ? data.rates.TRY : null;
  } catch {
    return null;
  }
}
