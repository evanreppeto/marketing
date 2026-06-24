// Mints a workspace-scoped Arc API token for the Big Shoulders Partner
// Directory sync and prints the plaintext ONCE. Store the printed value in
// Big Shoulders' ARC_PARTNER_SYNC_TOKEN env var — it cannot be retrieved later
// (only its sha256 hash is stored).
//
// Run from the Arc repo with env loaded, e.g.:
//   node --env-file=.env.local scripts/issue-partner-sync-token.mjs
//
// Token shape + hashing mirror src/lib/agent/tokens.ts (generateToken/hashToken).

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL ||
  process.env.MARKETING_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY;
const orgSlug = process.env.DEFAULT_ORG_SLUG || "big-shoulders-restoration";
const workspaceKey = process.env.DEFAULT_WORKSPACE_KEY || "default";

if (!url || !serviceKey) {
  console.error("Missing Supabase URL / service-role key in env.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: org, error: orgError } = await db
  .from("organizations")
  .select("id, name")
  .eq("slug", orgSlug)
  .single();
if (orgError || !org) {
  console.error(`Org '${orgSlug}' not found: ${orgError?.message ?? "no row"}`);
  process.exit(1);
}

const { data: workspace, error: wsError } = await db
  .from("workspaces")
  .select("id, name")
  .eq("org_id", org.id)
  .eq("key", workspaceKey)
  .single();
if (wsError || !workspace) {
  console.error(`Workspace '${workspaceKey}' for org '${orgSlug}' not found: ${wsError?.message ?? "no row"}`);
  process.exit(1);
}

const plaintext = `sk_live_${randomBytes(24).toString("base64url")}`;
const token_hash = createHash("sha256").update(plaintext).digest("hex");
const prefix = plaintext.slice(0, 12);

const { error: insertError } = await db.from("agent_api_tokens").insert({
  org_id: org.id,
  workspace_id: workspace.id,
  token_hash,
  prefix,
  label: "BSR Partner Directory Sync",
});
if (insertError) {
  console.error(`Failed to insert token: ${insertError.message}`);
  process.exit(1);
}

console.log("");
console.log(`Org:        ${org.name} (${org.id})`);
console.log(`Workspace:  ${workspace.name} (${workspace.id})`);
console.log(`Prefix:     ${prefix}`);
console.log("");
console.log("ARC_PARTNER_SYNC_TOKEN (store now — shown once):");
console.log(plaintext);
console.log("");
