// Read-only diagnostic for the live Arc/Arc connection state.
// Usage: pnpm diagnose:arc  (reads .env.local for Supabase URL + service key)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadEnv(path) {
  const env = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const env = loadEnv(envPath);
const url =
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.MARKETING_SUPABASE_URL ||
  env.NEXT_PUBLIC_MARKETING_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.MARKETING_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL or service role key in .env.local");
  process.exit(1);
}

const base = url.replace(/\/$/, "");
const headers = { apikey: key, authorization: `Bearer ${key}` };

async function q(path, label) {
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) return { label, error: `HTTP ${res.status} ${await res.text()}` };
    return { label, rows: await res.json() };
  } catch (e) {
    return { label, error: e?.message ?? String(e) };
  }
}

function show(r) {
  console.log(`\n=== ${r.label} ===`);
  if (r.error) return console.log("  ERROR:", r.error);
  if (!r.rows?.length) return console.log("  (none)");
  console.log(JSON.stringify(r.rows, null, 2));
}

const results = await Promise.all([
  q("agent_connections?select=*", "agent_connections (health / last_seen)"),
  q("agents?select=key,name,status&limit=5", "agents (attached runners)"),
  q("agent_api_tokens?select=id,label,revoked_at,created_at,last_used_at&order=created_at.desc&limit=10", "agent_api_tokens (issued tokens)"),
  q("agent_tasks?select=id,task_type,status,created_at&task_type=eq.arc_chat_message&order=created_at.desc&limit=8", "recent arc_chat_message tasks (settling?)"),
  q("arc_messages?select=id,role,status,created_at&order=created_at.desc&limit=8", "arc_messages (pending vs complete)"),
]);

console.log("Supabase:", base);
for (const r of results) show(r);
console.log("\nEnv flags (.env.local):");
console.log("  ARC_AGENT_API_TOKEN set?", Boolean(env.ARC_AGENT_API_TOKEN));
console.log("  SUPABASE_SERVICE_ROLE_KEY set?", Boolean(key));
console.log("  ARC_RUNNER_URL:", env.ARC_RUNNER_URL || "(unset)");
console.log("  ARC_WEBHOOK_SECRET set?", Boolean(env.ARC_WEBHOOK_SECRET));
console.log("  ARC_AGENT_KEY:", env.ARC_AGENT_KEY || "(unset)");
