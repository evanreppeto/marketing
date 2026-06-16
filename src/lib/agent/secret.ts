import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

type SecretRow = { decrypted_secret: string | null };

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

export async function writeWebhookSecret(plaintext: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<string> {
  const name = `agent_webhook_secret_${DEFAULT_WORKSPACE_ID}`;
  let ref: string | null = null;

  try {
    const direct = await client.rpc("create_secret", {
      new_secret: plaintext,
      new_name: name,
      new_description: "Agent outbound webhook HMAC signing secret",
    });
    if (!direct.error && direct.data) ref = String(direct.data);
  } catch {
    ref = null;
  }

  if (!ref && typeof client.schema === "function") {
    try {
      const scoped = await client.schema("vault").rpc("create_secret", {
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

  const { error } = await client
    .from("agent_connections")
    .update({ webhook_secret_ref: ref })
    .eq("workspace_id", DEFAULT_WORKSPACE_ID);
  if (error) throw new Error(`agent_connections secret ref: ${error.message}`);
  return ref;
}
