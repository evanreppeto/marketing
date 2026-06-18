import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

type SecretRow = { decrypted_secret: string | null };
type CreateSecretArgs = { new_secret: string; new_name: string; new_description: string };
type SecretRpcResult = { data: string | null; error: { message: string } | null };
type VaultSecretClient = {
  schema(schema: "vault"): {
    rpc(fn: "create_secret", args: CreateSecretArgs): Promise<SecretRpcResult>;
  };
};

export async function resolveWebhookSecret(ref: string | null, client?: SupabaseClient): Promise<string | null> {
  const envSecret = process.env.ARC_WEBHOOK_SECRET;
  if (envSecret) return envSecret;
  if (!ref) return null;

  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return null;

  try {
    const scoped = typeof supabase.schema === "function" ? supabase.schema("vault") : supabase;
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

export async function writeWebhookSecret(plaintext: string, client?: SupabaseClient): Promise<string> {
  const db = client ?? getSupabaseAdminClient();
  const context = client ? null : await getCurrentWorkspaceContext().catch(() => null);
  const workspaceId = context?.workspaceKey ?? DEFAULT_WORKSPACE_ID;
  const name = `agent_webhook_secret_${workspaceId}`;
  let ref: string | null = null;

  try {
    const direct = await db.rpc("create_secret", {
      new_secret: plaintext,
      new_name: name,
      new_description: "Agent outbound webhook HMAC signing secret",
    });
    if (!direct.error && direct.data) ref = String(direct.data);
  } catch {
    ref = null;
  }

  if (!ref && typeof db.schema === "function") {
    try {
      const scoped = await (db as unknown as VaultSecretClient).schema("vault").rpc("create_secret", {
        new_secret: plaintext,
        new_name: name,
        new_description: "Agent outbound webhook HMAC signing secret",
      });
      if (!scoped.error && scoped.data) ref = String(scoped.data);
    } catch {
      ref = null;
    }
  }

  if (!ref) throw new Error("vault.create_secret: no id");

  let query = db
    .from("agent_connections")
    .update({ webhook_secret_ref: ref })
    .eq("workspace_id", workspaceId);

  if (context?.orgId) query = query.eq("org_id", context.orgId);

  let { error } = await query;

  if (error && context?.orgId) {
    const legacyResult = await db
      .from("agent_connections")
      .update({ webhook_secret_ref: ref })
      .eq("workspace_id", workspaceId);
    error = legacyResult.error;
  }

  if (error) throw new Error(`agent_connections secret ref: ${error.message}`);
  return ref;
}
