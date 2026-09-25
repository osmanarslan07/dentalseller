// Lists English texts used with t("…") / msg("…") that have no Turkish entry in src/i18n/tr.
// usage: node scripts/i18n-missing.mjs [path-filter]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "src");
const filter = process.argv[2] ?? "";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const unquote = (q) => {
  try {
    return q[0] === "'" ? JSON.parse(`"${q.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) : JSON.parse(q);
  } catch {
    return q.slice(1, -1);
  }
};

// keys of the Turkish dictionary
const known = new Set();
for (const f of walk(path.join(root, "i18n", "tr"))) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)\s*:/gm)) {
    known.add(m[1][0] === '"' || m[1][0] === "'" ? unquote(m[1]) : m[1]);
  }
}

// texts used in code
const missing = new Map();
const call = /\b(?:t|tx|tr|msg)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`$]*`)/g;
for (const f of walk(root)) {
  if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
  const rel = path.relative(path.resolve(root, ".."), f).replace(/\\/g, "/");
  if (filter && !rel.includes(filter)) continue;
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(call)) {
    const q = m[1];
    const text = q[0] === "`" ? q.slice(1, -1) : unquote(q);
    if (!known.has(text)) {
      if (!missing.has(text)) missing.set(text, new Set());
      missing.get(text).add(rel);
    }
  }
}

for (const [text, files] of missing) console.log(`${JSON.stringify(text)}  ← ${[...files].join(", ")}`);
console.log(`\n${missing.size} missing, ${known.size} Turkish entries`);
