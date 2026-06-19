import { createHash, randomBytes } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
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
  org_id?: string;
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type VerifyAgentTokenResult = { ok: true; workspaceId: string; orgId?: string } | { ok: false };

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

async function getTokenScope(client?: SupabaseClient): Promise<{ orgId: string | null; workspaceId: string }> {
  const context = await getCurrentWorkspaceContext().catch(() => null);
  return {
    orgId: context?.orgId ?? null,
    workspaceId: context?.workspaceId ?? context?.workspaceKey ?? DEFAULT_WORKSPACE_ID,
  };
}

export async function issueAgentToken(
  label: string,
  client?: SupabaseClient,
): Promise<{ plaintext: string; summary: AgentTokenSummary }> {
  const db = client ?? getSupabaseAdminClient();
  const token = generateToken();
  const scope = await getTokenScope(client);
  const payload = {
    ...(scope.orgId ? { org_id: scope.orgId } : {}),
    workspace_id: scope.workspaceId,
    token_hash: token.hash,
    prefix: token.prefix,
    label: label.trim() || null,
  };
  let result = await db
    .from("agent_api_tokens")
    .insert(payload)
    .select("id,prefix,label,created_at,last_used_at,revoked_at")
    .single<AgentTokenRow>();

  if (result.error && scope.orgId) {
    const legacyPayload = {
      workspace_id: payload.workspace_id,
      token_hash: payload.token_hash,
      prefix: payload.prefix,
      label: payload.label,
    };
    result = await db
      .from("agent_api_tokens")
      .insert(legacyPayload)
      .select("id,prefix,label,created_at,last_used_at,revoked_at")
      .single<AgentTokenRow>();
  }

  if (result.error || !result.data) throw new Error(`agent_api_tokens insert: ${result.error?.message ?? "no row"}`);
  return { plaintext: token.plaintext, summary: toSummary(result.data) };
}

export async function listAgentTokens(client?: SupabaseClient): Promise<AgentTokenSummary[]> {
  const db = client ?? getSupabaseAdminClient();
  const scope = await getTokenScope(client);
  let query = db
    .from("agent_api_tokens")
    .select("id,prefix,label,created_at,last_used_at,revoked_at")
    .eq("workspace_id", scope.workspaceId);

  if (scope.orgId) query = query.eq("org_id", scope.orgId);

  let { data, error } = await query.order("created_at", { ascending: false });

  if (error && scope.orgId) {
    const legacyResult = await db
      .from("agent_api_tokens")
      .select("id,prefix,label,created_at,last_used_at,revoked_at")
      .eq("workspace_id", scope.workspaceId)
      .order("created_at", { ascending: false });
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) throw new Error(`agent_api_tokens list: ${error.message}`);
  return ((data ?? []) as AgentTokenRow[]).map(toSummary);
}

export async function hasActiveAgentTokens(client?: SupabaseClient): Promise<boolean> {
  const db = client ?? getSupabaseAdminClient();
  const scope = await getTokenScope(client);
  let query = db
    .from("agent_api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", scope.workspaceId)
    .is("revoked_at", null);

  if (scope.orgId) query = query.eq("org_id", scope.orgId);

  let { count, error } = await query;

  if (error && scope.orgId) {
    const legacyResult = await db
      .from("agent_api_tokens")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", scope.workspaceId)
      .is("revoked_at", null);
    count = legacyResult.count;
    error = legacyResult.error;
  }

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
    .select("org_id,workspace_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle<{ org_id?: string; workspace_id: string }>();

  if (error || !data) return { ok: false };

  await client
    .from("agent_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return data.org_id ? { ok: true, workspaceId: data.workspace_id, orgId: data.org_id } : { ok: true, workspaceId: data.workspace_id };
}

export async function revokeAgentToken(id: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("agent_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`agent_api_tokens revoke: ${error.message}`);
}
