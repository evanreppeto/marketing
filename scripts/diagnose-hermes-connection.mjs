// Throwaway diagnostic: report the live Hermes/Mark connection state.
// Read-only. Reads .env.local, queries Supabase REST with the service-role key.
import { readFileSync } from "node:fs";

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

const env = loadEnv(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const url =
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.MARKETING_SUPABASE_URL ||
  env.NEXT_PUBLIC_MARKETING_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.MARKETING_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL or service role key in .env.local");
  console.error("url?", Boolean(url), "key?", Boolean(key));
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
  q("agent_connections?select=*", "agent_connections (webhook URL / enabled / last health)"),
  q("agents?select=*&limit=5", "agents (attached runners — shape)"),
  q("agent_api_tokens?select=id,label,revoked_at,created_at,last_used_at&order=created_at.desc&limit=10", "agent_api_tokens (issued sk_live_ tokens)"),
  q("agent_tasks?select=*&order=created_at.desc&limit=6", "agent_tasks (recent — shape + are chat msgs settling?)"),
  q("mark_messages?select=id,role,status,created_at&order=created_at.desc&limit=8", "mark_messages (recent chat — pending vs complete?)"),
]);

console.log("Supabase:", base);
for (const r of results) show(r);
console.log("\nEnv flags (.env.local):");
console.log("  HERMES_AGENT_API_TOKEN set?", Boolean(env.HERMES_AGENT_API_TOKEN));
console.log("  MARK_RUNNER_URL:", env.MARK_RUNNER_URL || "(unset)");
console.log("  MARK_WEBHOOK_SECRET set?", Boolean(env.MARK_WEBHOOK_SECRET));
console.log("  MARK_AGENT_KEY:", env.MARK_AGENT_KEY || "(unset)");
