import { createHash, randomBytes } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

export type AgentTokenSummary = {
  id: string;
  prefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type AgentTokenRow = {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type VerifyAgentTokenResult = { ok: true; workspaceId: string } | { ok: false };

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `sk_live_${randomBytes(24).toString("base64url")}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hash: hashToken(plaintext),
  };
}

function toSummary(row: AgentTokenRow): AgentTokenSummary {
  return {
    id: row.id,
    prefix: row.prefix,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function issueAgentToken(
  label: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ plaintext: string; summary: AgentTokenSummary }> {
  const token = generateToken();
  const { data, error } = await client
    .from("agent_api_tokens")
    .insert({
      workspace_id: DEFAULT_WORKSPACE_ID,
      token_hash: token.hash,
      prefix: token.prefix,
      label: label.trim() || null,
    })
    .select("id,prefix,label,created_at,last_used_at,revoked_at")
    .single<AgentTokenRow>();

  if (error || !data) throw new Error(`agent_api_tokens insert: ${error?.message ?? "no row"}`);
  return { plaintext: token.plaintext, summary: toSummary(data) };
}

export async function listAgentTokens(client: SupabaseClient = getSupabaseAdminClient()): Promise<AgentTokenSummary[]> {
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("id,prefix,label,created_at,last_used_at,revoked_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`agent_api_tokens list: ${error.message}`);
  return ((data ?? []) as AgentTokenRow[]).map(toSummary);
}

export async function hasActiveAgentTokens(client: SupabaseClient = getSupabaseAdminClient()): Promise<boolean> {
  const { count, error } = await client
    .from("agent_api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .is("revoked_at", null);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function verifyAgentToken(
  plaintext: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<VerifyAgentTokenResult> {
  const tokenHash = hashToken(plaintext);
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("workspace_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle<{ workspace_id: string }>();

  if (error || !data) return { ok: false };

  await client
    .from("agent_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return { ok: true, workspaceId: data.workspace_id };
}

export async function revokeAgentToken(id: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("agent_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`agent_api_tokens revoke: ${error.message}`);
}
