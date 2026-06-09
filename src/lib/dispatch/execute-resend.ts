import { type SupabaseClient } from "@supabase/supabase-js";

import { buildResendEmailPayload, type ResendEmailPayload } from "@/domain";

import { recordConnectionUse } from "@/lib/connections/persistence";
import { sendResendEmail } from "@/lib/connections/resend-client";

// The ONLY place the app performs a real send. It operates on an already-queued,
// approval-linked `outbound_dispatches` row and refuses anything that isn't both
// queued and approved — the outbound-locked invariant ("the app never sends
// unapproved content"). Idempotent: an already-dispatched row is never re-sent.
//
// NOTE (tech debt): this stands alone against `outbound_dispatches`. The simpler,
// deliverable-level `campaign_dispatches`/launch.ts flow is not reconciled onto it
// yet (see 20260605120000_campaign_dispatches.sql).

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export type ExecuteResendResult = {
  ok: boolean;
  message: string;
  providerMessageId?: string;
};

export type ExecuteResendDeps = {
  /** Injected for tests; defaults to the real Resend HTTP client. */
  send?: (apiKey: string, payload: ResendEmailPayload) => Promise<{ id: string }>;
  /** Override the resolved key (tests); defaults to process.env.RESEND_API_KEY. */
  apiKey?: string;
};

type DispatchRow = {
  id: string;
  status: string;
  approval_item_id: string | null;
  channel: string | null;
  campaign_id: string | null;
  provider_message_id: string | null;
  payload: { to?: string | string[]; subject?: string; html?: string; text?: string } | null;
};

async function logCampaignEvent(
  client: SupabaseClient,
  campaignId: string | null,
  eventType: "dispatch_sent" | "dispatch_failed",
  actor: string,
  detail: string,
) {
  if (!campaignId) return;
  const { error } = await client.from("campaign_events").insert({
    campaign_id: campaignId,
    event_type: eventType,
    actor,
    detail,
    payload: { channel: "email", provider: "resend" },
  });
  assertOk("campaign_events insert", error);
}

export async function executeResendDispatch(
  input: { dispatchId: string; operator: string },
  client: SupabaseClient,
  deps: ExecuteResendDeps = {},
): Promise<ExecuteResendResult> {
  const { dispatchId, operator } = input;
  const send = deps.send ?? sendResendEmail;

  const { data: dispatch, error: dispatchError } = await client
    .from("outbound_dispatches")
    .select("id,status,approval_item_id,channel,campaign_id,provider_message_id,payload")
    .eq("id", dispatchId)
    .maybeSingle<DispatchRow>();
  assertOk("outbound_dispatches lookup", dispatchError);

  if (!dispatch) return { ok: false, message: "Dispatch not found." };

  if (dispatch.status === "dispatched") {
    return {
      ok: true,
      message: "Already sent — no re-send.",
      providerMessageId: dispatch.provider_message_id ?? undefined,
    };
  }
  if (dispatch.status !== "queued") {
    return { ok: false, message: `Dispatch is ${dispatch.status}; only queued dispatches can be sent.` };
  }
  if (!dispatch.approval_item_id) {
    return { ok: false, message: "Dispatch is not linked to an approval, so it can't be sent." };
  }

  const { data: approval, error: approvalError } = await client
    .from("approval_items")
    .select("status")
    .eq("id", dispatch.approval_item_id)
    .maybeSingle<{ status: string }>();
  assertOk("approval_items lookup", approvalError);
  if (!approval || !/approved/i.test(approval.status)) {
    return { ok: false, message: "The linked approval isn't approved yet." };
  }

  const apiKey = deps.apiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "Resend isn't configured (RESEND_API_KEY is missing)." };
  }

  const { data: connection, error: connectionError } = await client
    .from("connections")
    .select("enabled,env_var,config")
    .eq("provider", "resend")
    .maybeSingle<{ enabled: boolean; env_var: string | null; config: Record<string, unknown> | null }>();
  assertOk("connections lookup", connectionError);
  if (!connection?.enabled) {
    return { ok: false, message: "Resend is connected but disabled. Enable it in Settings → Connections." };
  }

  const config = connection.config ?? {};
  const from = (typeof config.fromEmail === "string" && config.fromEmail) || process.env.RESEND_FROM;
  if (!from) {
    return { ok: false, message: "No from-address configured for Resend (set config.fromEmail or RESEND_FROM)." };
  }

  let payload: ResendEmailPayload;
  try {
    payload = buildResendEmailPayload({
      from,
      to: dispatch.payload?.to ?? [],
      subject: dispatch.payload?.subject ?? "",
      html: dispatch.payload?.html,
      text: dispatch.payload?.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid email payload.";
    await markFailed(client, dispatchId, dispatch.campaign_id, operator, message);
    return { ok: false, message };
  }

  let providerMessageId: string;
  try {
    const sent = await send(apiKey, payload);
    providerMessageId = sent.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend send failed.";
    await markFailed(client, dispatchId, dispatch.campaign_id, operator, message);
    return { ok: false, message };
  }

  const { error: updateError } = await client
    .from("outbound_dispatches")
    .update({
      status: "dispatched",
      provider: "resend",
      provider_message_id: providerMessageId,
      dispatched_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", dispatchId);
  assertOk("outbound_dispatches dispatched update", updateError);

  await recordConnectionUse(client, "resend");
  await logCampaignEvent(client, dispatch.campaign_id, "dispatch_sent", operator, `Sent via Resend (${providerMessageId}).`);

  return { ok: true, message: "Sent via Resend.", providerMessageId };
}

async function markFailed(
  client: SupabaseClient,
  dispatchId: string,
  campaignId: string | null,
  operator: string,
  message: string,
) {
  const { error } = await client
    .from("outbound_dispatches")
    .update({ status: "failed", last_error: message })
    .eq("id", dispatchId);
  assertOk("outbound_dispatches failed update", error);
  await logCampaignEvent(client, campaignId, "dispatch_failed", operator, message);
}
