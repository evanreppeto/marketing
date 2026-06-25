/**
 * One-shot single-tenant onboarding: read the Higgsfield OAuth bundle from the
 * local Claude client's credential store and store it (enabled) on a workspace's
 * higgsfield connector. Run locally by an operator, never in the request path.
 *
 *   pnpm connectors:capture-higgsfield -- --workspace <workspaceId> [--org <orgId>]
 *
 * Requires the same Supabase admin env the app uses (NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY). Prints only masked confirmation — never tokens.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildHiggsfieldBundleFromMcpEntry } from "@/lib/connectors/capture-bundle";
import { writeConnectorCredential } from "@/lib/connectors/credentials";
import { setConnectorCredentialRef, setConnectorEnabled } from "@/lib/connectors/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const workspaceId = arg("workspace");
  const orgId = arg("org") ?? null;
  if (!workspaceId) throw new Error("--workspace <workspaceId> is required");
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase admin env not configured");

  const credsPath = join(homedir(), ".claude", ".credentials.json");
  const creds = JSON.parse(readFileSync(credsPath, "utf8")) as { mcpOAuth?: Record<string, McpEntry> };
  const key = Object.keys(creds.mcpOAuth ?? {}).find((k) => /higgs/i.test(k));
  if (!key) throw new Error(`No higgsfield entry found in ${credsPath} (connect Higgsfield in a Claude client first)`);
  const e = creds.mcpOAuth![key];

  const serialized = buildHiggsfieldBundleFromMcpEntry({
    accessToken: e.accessToken,
    refreshToken: e.refreshToken,
    expiresAt: e.expiresAt,
    clientId: e.clientId,
  });

  const client = getSupabaseAdminClient();
  const ref = await writeConnectorCredential(client, { workspaceId, connectorKey: "higgsfield", plaintext: serialized });
  await setConnectorCredentialRef(client, { workspaceId, orgId, connectorKey: "higgsfield", credentialRef: ref });
  await setConnectorEnabled(client, { workspaceId, connectorKey: "higgsfield", enabled: true });

  const exp = new Date(e.expiresAt).toISOString();
  console.log(`Stored higgsfield credential for workspace ${workspaceId}: accessToken oat_…${e.accessToken.slice(-4)}, refresh present, expiresAt ${exp}, enabled.`);
}

type McpEntry = { accessToken: string; refreshToken: string; expiresAt: number; clientId: string };

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
