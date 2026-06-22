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

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL or MARKETING_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY or MARKETING_SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
].filter(([, value]) => !value);

if (missing.length) {
  console.error("[health:constraints] Missing required env vars:");
  for (const [label] of missing) console.error(`- ${label}`);
  process.exitCode = 1;
} else {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await admin.rpc("check_agent_task_tenancy_constraints");
    if (error) {
      const migrationHint = error.message.includes("Could not find the function")
        ? " Run supabase/migrations/20260622143000_enforce_agent_tasks_tenancy_constraints.sql if this RPC is missing."
        : "";
      throw new Error(`${error.message}.${migrationHint}`);
    }

    const rows = data ?? [];
    if (!rows.length) throw new Error("check_agent_task_tenancy_constraints returned no rows");
    const failed = rows.filter((row) => !row.ok);

    for (const row of rows) {
      const status = row.ok ? "ok" : "failed";
      console.log(`[health:constraints] ${status} ${row.check_name} (${row.detail})`);
    }

    if (failed.length) {
      throw new Error(`${failed.length} agent task tenancy constraint check(s) failed`);
    }
    console.log("[health:constraints] Agent task tenancy constraints passed.");
  } catch (error) {
    console.error(`[health:constraints] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
