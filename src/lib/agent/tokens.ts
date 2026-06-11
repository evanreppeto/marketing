import { createHash, randomBytes } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = "sk_live_" + randomBytes(24).toString("base64url");
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashToken(plaintext) };
}

export type AgentTokenSummary = {
  id: string;
  prefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Issue a token. Returns the plaintext ONCE — it is never recoverable after. */
export async function issueAgentToken(
  label: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ plaintext: string; summary: AgentTokenSummary }> {
  const { plaintext, prefix, hash } = generateToken();
  const { data, error } = await client
    .from("agent_api_tokens")
    .insert({ workspace_id: DEFAULT_WORKSPACE_ID, token_hash: hash, prefix, label: label.trim() || null })
    .select("id, prefix, label, created_at, last_used_at, revoked_at")
    .single<{ id: string; prefix: string; label: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }>();
  if (error || !data) throw new Error(`agent_api_tokens insert: ${error?.message ?? "no row"}`);
  return {
    plaintext,
    summary: { id: data.id, prefix: data.prefix, label: data.label, createdAt: data.created_at, lastUsedAt: data.last_used_at, revokedAt: data.revoked_at },
  };
}

export async function listAgentTokens(client: SupabaseClient = getSupabaseAdminClient()): Promise<AgentTokenSummary[]> {
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("id, prefix, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`agent_api_tokens list: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string, prefix: r.prefix as string, label: (r.label as string | null), createdAt: r.created_at as string,
    lastUsedAt: r.last_used_at as string | null, revokedAt: r.revoked_at as string | null,
  }));
}

export type VerifyResult = { ok: true; workspaceId: string } | { ok: false };

/** Match a presented token against a non-revoked hash; bump last_used on hit. */
export async function verifyAgentToken(plaintext: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<VerifyResult> {
  const hash = hashToken(plaintext);
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("workspace_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle<{ workspace_id: string }>();
  if (error || !data) return { ok: false };
  await client.from("agent_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
  return { ok: true, workspaceId: data.workspace_id };
}

export async function revokeAgentToken(id: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("agent_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`agent_api_tokens revoke: ${error.message}`);
}
