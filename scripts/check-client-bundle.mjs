// Fails if a server secret ends up in the browser bundle (.next/static).
// Run after `next build`:  npm run check:bundle
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const staticDir = path.join(root, ".next", "static");
if (!existsSync(staticDir)) {
  console.error("No .next/static directory. Run `npm run build` first.");
  process.exit(2);
}

// Load .env.local so we can search for the actual secret value too.
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  /* optional */
}

// Patterns are for real key material; supabase-js itself contains the bare
// string "sb_secret_" (a prefix check), which is not a leak.
const patterns = [{ label: "secret key (sb_secret_…)", re: /sb_secret_[A-Za-z0-9_-]{16,}/ }];

const needles = [
  { label: "env var name SUPABASE_SECRET_KEY", value: "SUPABASE_SECRET_KEY" },
  // base64url of '"role":"service_role"' as it appears inside a legacy JWT payload.
  { label: "service_role JWT payload", value: "InNlcnZpY2Vfcm9sZSI" },
];
if (process.env.SUPABASE_SECRET_KEY) needles.push({ label: "SUPABASE_SECRET_KEY value", value: process.env.SUPABASE_SECRET_KEY });
if (process.env.CRON_SECRET) needles.push({ label: "CRON_SECRET value", value: process.env.CRON_SECRET });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let files = 0;
const hits = [];
for (const file of walk(staticDir)) {
  files++;
  const text = readFileSync(file, "utf8");
  for (const n of needles) if (text.includes(n.value)) hits.push(`${n.label} in ${path.relative(root, file)}`);
  for (const p of patterns) if (p.re.test(text)) hits.push(`${p.label} in ${path.relative(root, file)}`);
}

if (hits.length) {
  console.error(`FAIL: server secrets found in client bundle:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`OK: scanned ${files} client files, no server secrets found.`);
