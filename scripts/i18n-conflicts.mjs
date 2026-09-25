// Lists English texts given different Turkish translations in different src/i18n/tr files
// (the later file in index.ts wins, which may not be the one intended).
// usage: node scripts/i18n-conflicts.mjs
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "..", "src", "i18n", "tr");
const seen = new Map();
const entry = /^\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)\s*:\s*\n?\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gm;
const unq = (q) => (q[0] === '"' || q[0] === "'" ? q.slice(1, -1) : q);
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".ts") && n !== "index.ts")) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of src.matchAll(entry)) {
    const key = unq(m[1]);
    const val = unq(m[2]);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push([f, val]);
  }
}
let n = 0;
for (const [key, list] of seen) {
  const vals = new Set(list.map(([, v]) => v));
  if (vals.size > 1) {
    n++;
    console.log(JSON.stringify(key), list.map(([f, v]) => `${f}: ${v}`).join(" | "));
  }
}
console.log(`\n${n} conflicting`);
