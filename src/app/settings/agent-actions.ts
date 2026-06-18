"use server";

import { revalidatePath } from "next/cache";

import { type SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_WORKSPACE_ID } from "@/lib/agent/connection";
import { type MarketingAgentProfile } from "@/lib/agent/marketing-guidance";
import { writeWebhookSecret } from "@/lib/agent/secret";
import { createArcSetupBundle, generateWebhookSecret, type ArcSetupBundle } from "@/lib/agent/setup-bundle";
import { issueAgentToken, revokeAgentToken } from "@/lib/agent/tokens";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentActionState = { ok: boolean; message: string } | null;
export type IssueTokenResult = { ok: true; plaintext: string; message: string } | { ok: false; message: string };
export type GenerateSetupBundleResult =
  | ({ ok: true; message: string } & ArcSetupBundle)
  | { ok: false; message: string };

async function requireAgentAdmin(): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin env vars are required to manage the agent connection.");
  }
}

export async function saveAgentConnectionAction(formData: FormData): Promise<void> {
  await requireAgentAdmin();
  const displayName = String(formData.get("display_name") ?? "").trim() || null;
  const agentKey = String(formData.get("agent_key") ?? "").trim() || null;
  const webhookUrl = String(formData.get("webhook_url") ?? "").trim() || null;
  const enabled = formData.get("enabled") === "on";

  const client = getSupabaseAdminClient() as SupabaseClient;
  const context = await getCurrentWorkspaceContext().catch(() => null);
  const payload = {
    ...(context?.orgId ? { org_id: context.orgId } : {}),
    workspace_id: context?.workspaceKey ?? DEFAULT_WORKSPACE_ID,
    display_name: displayName,
    agent_key: agentKey,
    webhook_url: webhookUrl,
    enabled,
  };
  let { error } = await client.from("agent_connections").upsert(payload, {
    onConflict: context?.orgId ? "org_id,workspace_id" : "workspace_id",
  });

  if (error && context?.orgId) {
    const legacyPayload = {
      workspace_id: payload.workspace_id,
      display_name: payload.display_name,
      agent_key: payload.agent_key,
      webhook_url: payload.webhook_url,
      enabled: payload.enabled,
    };
    const legacyResult = await client.from("agent_connections").upsert(legacyPayload, { onConflict: "workspace_id" });
    error = legacyResult.error;
  }

  if (error) throw new Error(`agent_connections save: ${error.message}`);
  revalidatePath("/settings");
}

export async function setWebhookSecretAction(formData: FormData): Promise<void> {
  await requireAgentAdmin();
  const secret = String(formData.get("secret") ?? "").trim();
  if (!secret) return;
  await writeWebhookSecret(secret);
  revalidatePath("/settings");
}

export async function issueAgentTokenAction(formData: FormData): Promise<IssueTokenResult> {
  try {
    await requireAgentAdmin();
    const label = String(formData.get("label") ?? "");
    const { plaintext } = await issueAgentToken(label);
    revalidatePath("/settings");
    return { ok: true, plaintext, message: "Token generated. Copy it now; it will not be shown again." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not issue an agent token." };
  }
}

export async function generateAgentSetupBundleAction(formData: FormData): Promise<GenerateSetupBundleResult> {
  try {
    await requireAgentAdmin();
    const appBaseUrl = String(formData.get("app_base_url") ?? "").trim();
    if (!appBaseUrl) throw new Error("The hosted app URL is required before generating a setup bundle.");

    const agentName = String(formData.get("agent_name") ?? "").trim() || "Arc";
    const marketingProfile: MarketingAgentProfile = {
      companyName: String(formData.get("marketing_company_name") ?? "").trim(),
      serviceArea: String(formData.get("marketing_service_area") ?? "").trim(),
      services: String(formData.get("marketing_services") ?? "").trim(),
      idealCustomers: String(formData.get("marketing_ideal_customers") ?? "").trim(),
      differentiators: String(formData.get("marketing_differentiators") ?? "").trim(),
      brandVoice: String(formData.get("marketing_brand_voice") ?? "").trim(),
      forbiddenClaims: String(formData.get("marketing_forbidden_claims") ?? "").trim(),
    };
    const selectedSkillIds = formData.getAll("marketing_skill_ids").map((value) => String(value));
    const customInstructions = String(formData.get("marketing_custom_instructions") ?? "").trim();
    const client = getSupabaseAdminClient() as SupabaseClient;
    const context = await getCurrentWorkspaceContext().catch(() => null);
    const connectionPayload = {
      ...(context?.orgId ? { org_id: context.orgId } : {}),
      workspace_id: context?.workspaceKey ?? DEFAULT_WORKSPACE_ID,
      enabled: true,
    };
    let { error: connectionError } = await client.from("agent_connections").upsert(connectionPayload, {
      onConflict: context?.orgId ? "org_id,workspace_id" : "workspace_id",
      ignoreDuplicates: true,
    });

    if (connectionError && context?.orgId) {
      const legacyPayload = {
        workspace_id: connectionPayload.workspace_id,
        enabled: connectionPayload.enabled,
      };
      const legacyResult = await client
        .from("agent_connections")
        .upsert(legacyPayload, { onConflict: "workspace_id", ignoreDuplicates: true });
      connectionError = legacyResult.error;
    }

    if (connectionError) throw new Error(`agent_connections ensure: ${connectionError.message}`);

    const webhookSecret = generateWebhookSecret();
    await writeWebhookSecret(webhookSecret);
    const { plaintext } = await issueAgentToken("Arc setup bundle");

    revalidatePath("/settings");
    return {
      ok: true,
      message: "Setup bundle generated. Copy these values now; the token is only shown once.",
      ...createArcSetupBundle({
        agentName,
        appBaseUrl,
        token: plaintext,
        webhookSecret,
        marketingProfile,
        selectedSkillIds,
        customInstructions,
      }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not generate the setup bundle." };
  }
}

export async function revokeAgentTokenAction(formData: FormData): Promise<void> {
  await requireAgentAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await revokeAgentToken(id);
  revalidatePath("/settings");
}
