/** A person's photo, or their initials on a coloured circle when they have none. */
export function Avatar({
  name,
  url,
  size = "md",
  className = "",
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm", xl: "h-20 w-20 text-2xl" };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${sizes[size]} flex-none rounded-full object-cover ${className}`} />
    );
  }
  return (
    <span className={`${sizes[size]} grid flex-none place-items-center rounded-full bg-amber-500 font-bold text-white ${className}`}>
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
