import { Fragment, ReactNode } from "react";

/** A translated sentence with components in it: rich(t("Updated {when}"), { when: <RelativeTime … /> }).
 * Each {name} in the text becomes parts[name]; the rest stays text, so the word order is the
 * translation's own. */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (!(m[1] in parts)) continue;
    out.push(text.slice(last, m.index));
    out.push(<Fragment key={`${m[1]}-${m.index}`}>{parts[m[1]]}</Fragment>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
