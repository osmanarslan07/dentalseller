/** Forgiving text matching for names typed by people across languages: case-, accent- and
 * Turkish-letter-insensitive, so "ayse yilmaz" finds "Ayşe Yılmaz" and "YILMAZ" finds both. */
export function normalizeForSearch(text: string): string {
  return (
    text
      // Turkish lowercasing first: İ → i, I → ı (plain toLowerCase turns İ into i + a dot mark)
      .toLocaleLowerCase("tr")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .trim()
  );
}

/** Every whitespace-separated term in the query must appear somewhere in the haystacks. */
export function matchesQuery(query: string, haystacks: (string | null | undefined)[]): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = normalizeForSearch(haystacks.filter(Boolean).join(" "));
  return terms.every((t) => text.includes(t));
}
