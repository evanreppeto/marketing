import { type SupabaseClient } from "@supabase/supabase-js";

// Vault-backed connector credentials. Mirrors src/lib/agent/secret.ts: write via
// create_secret (with a vault-schema fallback), read via vault.decrypted_secrets.
// Stores/returns only refs + plaintext on demand — the row never holds the secret.

type SecretRow = { decrypted_secret: string | null };
type CreateSecretArgs = { new_secret: string; new_name: string; new_description: string };
type SecretRpcResult = { data: string | null; error: { message: string } | null };
type VaultSecretClient = {
  schema(schema: "vault"): { rpc(fn: "create_secret", args: CreateSecretArgs): Promise<SecretRpcResult> };
};

export async function writeConnectorCredential(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; plaintext: string },
): Promise<string> {
  const name = `connector_${input.connectorKey}_${input.workspaceId}`;
  const args: CreateSecretArgs = {
    new_secret: input.plaintext,
    new_name: name,
    new_description: `Workspace connector credential: ${input.connectorKey}`,
  };

  let ref: string | null = null;
  try {
    const direct = await client.rpc("create_secret", args);
    if (!direct.error && direct.data) ref = String(direct.data);
  } catch {
    ref = null;
  }

  if (!ref && typeof client.schema === "function") {
    try {
      const scoped = await (client as unknown as VaultSecretClient).schema("vault").rpc("create_secret", args);
      if (!scoped.error && scoped.data) ref = String(scoped.data);
    } catch {
      ref = null;
    }
  }

  if (!ref) throw new Error("vault.create_secret: no id");
  return ref;
}

export async function readConnectorCredential(client: SupabaseClient, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  try {
    const scoped = typeof client.schema === "function" ? client.schema("vault") : client;
    const { data, error } = await scoped
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", ref)
      .maybeSingle<SecretRow>();
    if (error || !data?.decrypted_secret) return null;
    return data.decrypted_secret;
  } catch {
    return null;
  }
}
