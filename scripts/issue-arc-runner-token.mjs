// Mints a workspace-scoped Arc token for the RUNNER and prints the plaintext ONCE.
//
// WHY THIS EXISTS: the runner currently authenticates with the shared
// ARC_AGENT_API_TOKEN env secret. checkAgentBearer() matches that value first and
// returns `tokenSource: "env"`, which carries no identity — so arcGuard has to work
// out which workspace the callback meant. It does that from the x-arc-workspace-id
// header the runner echoes, and when that header is absent it falls through to
// session-less resolution. A DB-issued token removes the question: it self-scopes
// (`tokenSource: "database"` -> {orgId, workspaceId} straight off the row), so the
// legacy branch is unreachable for anything holding one.
//
// This does NOT revoke or replace the env token by itself. Placing the printed
// value in the runner's ARC_AGENT_API_TOKEN is what switches it over; the app's own
// env var can then be removed separately (anyAgentTokenConfigured() already falls
// back to hasActiveAgentTokens(), so a DB-only setup stays configured).
//
// Run from the repo with prod env loaded:
//   node --env-file=.env.production.local scripts/issue-arc-runner-token.mjs
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

if (!url || !serviceKey) {
  console.error("Missing Supabase URL / service-role key in env.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const die = (message) => {
  console.error(message);
  process.exit(1);
};

/**
 * Resolve the target org. Deliberately NOT a lookup of DEFAULT_ORG_SLUG: that is
 * the pattern #479 removed from the request path, and it is no better here — it
 * throws outright on any deployment not slugged 'big-shoulders-restoration', and
 * picks a winner among real tenants once there is more than one. One org is the
 * only thing this could mean; several means say which, explicitly.
 */
async function resolveOrg() {
  const explicit = process.env.ARC_TOKEN_ORG_SLUG;
  if (explicit) {
    const { data, error } = await db.from("organizations").select("id,slug,name").eq("slug", explicit).maybeSingle();
    if (error) die(`organizations lookup failed: ${error.message}`);
    if (!data) die(`No organization with slug "${explicit}".`);
    return data;
  }

  const { data, error } = await db.from("organizations").select("id,slug,name").limit(2);
  if (error) die(`organizations lookup failed: ${error.message}`);
  if (!data?.length) die("No organization exists.");
  if (data.length > 1) {
    die(
      "This database holds more than one organization, so there is no sole org to mint for.\n" +
        "Name the one you mean: ARC_TOKEN_ORG_SLUG=<slug> node --env-file=… scripts/issue-arc-runner-token.mjs",
    );
  }
  return data[0];
}

/** Same rule one level down (#480): the sole ACTIVE workspace, whatever it is keyed. */
async function resolveWorkspace(org) {
  const explicit = process.env.ARC_TOKEN_WORKSPACE_KEY;
  const query = db.from("workspaces").select("id,key,name").eq("org_id", org.id).eq("status", "active");
  const { data, error } = explicit ? await query.eq("key", explicit).limit(2) : await query.limit(2);
  if (error) die(`workspaces lookup failed: ${error.message}`);
  if (!data?.length) die(`No active workspace for org "${org.slug}"${explicit ? ` keyed "${explicit}"` : ""}.`);
  if (data.length > 1) {
    die(
      `Org "${org.slug}" has more than one active workspace, so there is no sole workspace to mint for.\n` +
        "Name the one you mean: ARC_TOKEN_WORKSPACE_KEY=<key> node --env-file=… scripts/issue-arc-runner-token.mjs",
    );
  }
  return data[0];
}

const org = await resolveOrg();
const workspace = await resolveWorkspace(org);

// Surface any live runner token rather than silently minting a duplicate — each one
// is an independent credential that keeps working until it is revoked.
const { data: existing } = await db
  .from("agent_api_tokens")
  .select("prefix,label,created_at")
  .eq("org_id", org.id)
  .eq("workspace_id", workspace.id)
  .is("revoked_at", null);
if (existing?.length) {
  console.warn(`NOTE: ${existing.length} live token(s) already exist for this workspace:`);
  for (const t of existing) console.warn(`  ${t.prefix}… ${t.label ?? "(no label)"} — issued ${t.created_at}`);
  console.warn("Minting another. Revoke any you are replacing (set revoked_at) once the runner is switched over.\n");
}

const plaintext = `sk_live_${randomBytes(24).toString("base64url")}`;

// scopes is set EXPLICITLY. Leaving it NULL means "legacy token, unrestricted"
// (see 20260716130000) — the same shape of implicit answer this whole line of work
// has been removing. The runner genuinely needs the full Arc surface, so say so.
const { error: insertError } = await db.from("agent_api_tokens").insert({
  org_id: org.id,
  workspace_id: workspace.id,
  token_hash: createHash("sha256").update(plaintext).digest("hex"),
  prefix: plaintext.slice(0, 12),
  label: "Arc runner (Cloud Run)",
  scopes: ["arc:full"],
});
if (insertError) die(`Failed to insert token: ${insertError.message}`);

console.log("");
console.log(`Org:        ${org.name} (${org.slug})`);
console.log(`Workspace:  ${workspace.name} (key: ${workspace.key})`);
console.log(`Prefix:     ${plaintext.slice(0, 12)}`);
console.log(`Scopes:     arc:full`);
console.log("");
console.log("ARC_AGENT_API_TOKEN for the RUNNER — shown once, only its sha256 is stored:");
console.log(plaintext);
console.log("");
console.log("Place it on the runner (this is what actually switches it over):");
console.log("  gcloud run services update arc-runner \\");
console.log("    --project arc-marketing-500317 --region <region> \\");
console.log("    --update-env-vars ARC_AGENT_API_TOKEN=<the value above>");
console.log("");
console.log("Then confirm the callbacks self-scope — agent_connections.last_seen_at should");
console.log("keep advancing, and arcGuard should report source 'agent-token' rather than");
console.log("'legacy-env-token'. Leave the app's ARC_AGENT_API_TOKEN in place until that is");
console.log("confirmed; removing it is the last step, not the first.");
console.log("");
