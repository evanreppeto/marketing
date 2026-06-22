import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const root = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL ||
  process.env.MARKETING_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_MARKETING_SUPABASE_ANON_KEY;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL or MARKETING_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY or MARKETING_SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
].filter(([, value]) => !value);

if (missing.length) {
  console.error("[health:supabase] Missing required env vars:");
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredTables = [
  { name: "organizations", minRows: 1 },
  { name: "workspaces", minRows: 1 },
  { name: "organization_memberships", minRows: 0 },
  { name: "workspace_memberships", minRows: 0 },
  { name: "workspace_invites", minRows: 0 },
  { name: "agent_tasks", minRows: 0 },
  { name: "campaigns", minRows: 0 },
  { name: "campaign_assets", minRows: 0 },
  { name: "approval_items", minRows: 0 },
  { name: "agent_outputs", minRows: 0 },
  { name: "media_assets", minRows: 0 },
  { name: "media_folders", minRows: 0 },
];

const boundaryChecks = [
  { table: "workspaces", column: "org_id" },
  { table: "organization_memberships", column: "org_id" },
  { table: "workspace_memberships", column: "org_id" },
  { table: "workspace_memberships", column: "workspace_id" },
  { table: "workspace_invites", column: "org_id" },
  { table: "workspace_invites", column: "workspace_id" },
  { table: "agent_tasks", column: "org_id" },
  { table: "agent_tasks", column: "workspace_id" },
  { table: "campaigns", column: "org_id" },
  { table: "campaign_assets", column: "org_id" },
  { table: "approval_items", column: "org_id" },
  { table: "agent_outputs", column: "org_id" },
  { table: "media_assets", column: "org_id" },
  { table: "media_folders", column: "org_id" },
];

async function checkTable(table) {
  const { count, error } = await admin.from(table.name).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table.name}: ${error.message}`);
  if ((count ?? 0) < table.minRows) {
    throw new Error(`${table.name}: expected at least ${table.minRows} row(s), found ${count ?? 0}`);
  }
  console.log(`[health:supabase] table ok ${table.name} (${count ?? 0} rows)`);
}

async function checkBoundary({ table, column }) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).is(column, null);
  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  if ((count ?? 0) > 0) throw new Error(`${table}.${column}: ${count} row(s) are missing tenant scope`);
  console.log(`[health:supabase] boundary ok ${table}.${column}`);
}

try {
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authError) throw new Error(`auth.admin.listUsers: ${authError.message}`);
  console.log(`[health:supabase] auth ok (${authUsers.users.length} sampled user row(s))`);

  for (const table of requiredTables) await checkTable(table);
  for (const boundary of boundaryChecks) await checkBoundary(boundary);

  console.log("[health:supabase] Supabase health checks passed.");
} catch (error) {
  console.error(`[health:supabase] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
