import { type SupabaseClient } from "@supabase/supabase-js";

import { buildResendEmailPayload, type ResendEmailPayload } from "@/domain";

import { recordConnectionUse } from "@/lib/connections/persistence";
import { sendResendEmail } from "@/lib/connections/resend-client";

import { isLiveSendEnabled } from "./live-send";

// The ONLY place the app performs a real send. It operates on an already-queued
// (or operator-forced "send now" scheduled) approval-linked `campaign_dispatches`
// row — the single reconciled dispatch table (BSR-370, see
// docs/dispatch-reconciliation.md) — and refuses anything that isn't both pre-send
// and approved: the outbound-locked invariant ("the app never sends unapproved
// content"). Only ever reached from an explicit operator confirm in the Outbox.
// Idempotent: an already-sent row is never re-sent.

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
  org_id: string;
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

  // Master kill-switch: nothing leaves the building unless live sending has been
  // deliberately armed. Checked before any read/write so a dark environment is
  // provably inert — every earlier gate (approval, connection toggle) still applies.
  if (!isLiveSendEnabled()) {
    return { ok: false, message: "Live sending is turned off. Set ARC_SEND_ENABLED=1 to arm real sends." };
  }

  const { data: dispatch, error: dispatchError } = await client
    .from("campaign_dispatches")
    .select("id,org_id,status,approval_item_id,channel,campaign_id,provider_message_id,payload")
    .eq("id", dispatchId)
    .maybeSingle<DispatchRow>();
  assertOk("campaign_dispatches lookup", dispatchError);

  if (!dispatch) return { ok: false, message: "Dispatch not found." };

  if (dispatch.status === "sent") {
    return {
      ok: true,
      message: "Already sent — no re-send.",
      providerMessageId: dispatch.provider_message_id ?? undefined,
    };
  }
  if (dispatch.status !== "queued" && dispatch.status !== "scheduled") {
    return { ok: false, message: `Dispatch is ${dispatch.status}; only queued or scheduled dispatches can be sent.` };
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

  // Scope the connection to THIS dispatch's org. On the RLS-bypassing admin
  // client an unscoped `.eq("provider","resend")` would (with >1 org) either
  // throw on multiple rows or grab another tenant's from-address/kill-switch.
  const { data: connection, error: connectionError } = await client
    .from("connections")
    .select("enabled,env_var,config")
    .eq("org_id", dispatch.org_id)
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
    .from("campaign_dispatches")
    .update({
      status: "sent",
      provider: "resend",
      provider_message_id: providerMessageId,
      dispatched_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", dispatchId);
  assertOk("campaign_dispatches sent update", updateError);

  await recordConnectionUse(client, dispatch.org_id, "resend");
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
    .from("campaign_dispatches")
    .update({ status: "failed", last_error: message })
    .eq("id", dispatchId);
  assertOk("campaign_dispatches failed update", error);
  await logCampaignEvent(client, campaignId, "dispatch_failed", operator, message);
}
