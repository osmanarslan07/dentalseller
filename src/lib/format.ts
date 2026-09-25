export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** dd/mm/yyyy. A plain YYYY-MM-DD is read as-is (never shifted by timezone); timestamps use local time. */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

/** "1 admin", "3 sellers" */
export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
