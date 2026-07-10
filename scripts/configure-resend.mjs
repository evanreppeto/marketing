// Configure the Resend email connection so real sends can go out.
//
// `executeResendDispatch` (the ONLY place the app sends mail) gates on a row in
// the `connections` table: provider='resend', enabled=true, config.fromEmail set.
// Nothing in the UI writes that row yet (the Settings → Connections page still
// shows a static card — wiring it is the tracked follow-up), so this script is
// the supported way to arm the connection. It does NOT bypass any safety:
//   - the per-send approval gate still applies;
//   - the ARC_SEND_ENABLED master switch must still be =1 in the app's env;
//   - RESEND_API_KEY must still be present.
// This only records "which sender, and is the channel switched on".
//
//   node scripts/configure-resend.mjs                 # enable, from = arc@mail.bsr-restoration.com
//   node scripts/configure-resend.mjs --from "BSR <arc@mail.bsr-restoration.com>"
//   node scripts/configure-resend.mjs --disabled      # flip the connection kill-switch off
//   node scripts/configure-resend.mjs --org <uuid>    # target a specific workspace
//
// Idempotent: updates the existing resend row in place, or inserts one.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  try {
    const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    // no .env.local — rely on the ambient environment
  }
}
loadLocalEnv();

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local or the environment).");

const fromEmail = arg("--from", "arc@mail.bsr-restoration.com");
const enabled = !process.argv.includes("--disabled");
const org = arg("--org", null);

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  let existing = sb.from("connections").select("id,org_id,config").eq("provider", "resend");
  if (org) existing = existing.eq("org_id", org);
  const { data: rows, error: selErr } = await existing;
  if (selErr) throw new Error(`connections lookup failed: ${selErr.message}`);

  const nowIso = new Date().toISOString();
  const row = (rows ?? [])[0];

  if (row) {
    const config = { ...(row.config ?? {}), fromEmail };
    const { error } = await sb
      .from("connections")
      .update({ enabled, label: "Resend", kind: "email", env_var: "RESEND_API_KEY", config, updated_at: nowIso })
      .eq("id", row.id);
    if (error) throw new Error(`connections update failed: ${error.message}`);
    console.log(`Updated resend connection ${row.id} (org ${row.org_id}) → enabled=${enabled}, fromEmail="${fromEmail}".`);
  } else {
    const insert = {
      provider: "resend",
      kind: "email",
      label: "Resend",
      enabled,
      env_var: "RESEND_API_KEY",
      config: { fromEmail },
      created_at: nowIso,
      updated_at: nowIso,
    };
    if (org) insert.org_id = org; // else the DB default (default_organization_id()) applies
    const { data, error } = await sb.from("connections").insert(insert).select("id,org_id").single();
    if (error) throw new Error(`connections insert failed: ${error.message}`);
    console.log(`Created resend connection ${data.id} (org ${data.org_id}) → enabled=${enabled}, fromEmail="${fromEmail}".`);
  }

  console.log("");
  console.log("Remaining to send for real (all must be true):");
  console.log(`  • ARC_SEND_ENABLED=1 in the app environment   ${process.env.ARC_SEND_ENABLED === "1" ? "✓ set here" : "✗ not set here"}`);
  console.log(`  • RESEND_API_KEY present in the app environment ${process.env.RESEND_API_KEY ? "✓ set here" : "✗ not set here"}`);
  console.log(`  • the sending domain for "${fromEmail}" verified in Resend`);
  console.log("Then: approve + launch a campaign, and Confirm send on one queued recipient (a test to yourself first).");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
