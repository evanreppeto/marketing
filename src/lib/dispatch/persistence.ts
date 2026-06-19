import { type SupabaseClient } from "@supabase/supabase-js";

import { type AgentTaskTenantFields } from "@/lib/agent-tasks/scope";

import { DISPATCH_STATUS_ORDER, type DispatchStatus } from "./status";

const EVENT_FOR_STATUS: Partial<Record<DispatchStatus, string>> = {
  queued: "dispatch_queued",
  sent: "dispatch_sent",
  delivered: "dispatch_delivered",
  failed: "dispatch_failed",
  canceled: "dispatch_canceled",
};

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export type EnqueueInput = { campaignId: string; assetIds: string[]; operator: string; scheduledFor?: string; tenant?: AgentTaskTenantFields };

/** Insert one queued dispatch per approved asset. Called from the launch flow
 *  after assets are unlocked. No-op for an empty list. */
export async function enqueueDispatchesForAssets(input: EnqueueInput, client: SupabaseClient): Promise<void> {
  const { campaignId, assetIds, operator, tenant } = input;
  if (assetIds.length === 0) return;

  const { data: assetRows, error: assetError } = await applyOrgScope(
    client
      .from("campaign_assets")
      .select("id,channel,title")
      .in("id", assetIds),
    tenant,
  );
  assertOk("campaign_assets lookup", assetError);
  const assets = (assetRows ?? []) as Array<{ id: string; channel: string | null; title: string }>;

  const scheduled = Boolean(input.scheduledFor);
  for (const asset of assets) {
    const { error: insertError } = await client.from("campaign_dispatches").insert({
      ...orgTenantFields(tenant),
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      channel: asset.channel,
      status: scheduled ? "scheduled" : "queued",
      ...(scheduled ? { scheduled_for: input.scheduledFor } : {}),
      payload: { source: "campaign_launch", deliverable: asset.title },
    });
    assertOk("campaign_dispatches insert", insertError);

    const { error: eventError } = await client.from("campaign_events").insert({
      ...orgTenantFields(tenant),
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      event_type: scheduled ? "dispatch_scheduled" : "dispatch_queued",
      actor: operator,
      detail: scheduled
        ? `Scheduled "${asset.title}" for ${input.scheduledFor}.`
        : `Queued "${asset.title}" for dispatch.`,
      payload: { channel: asset.channel, ...(scheduled ? { scheduled_for: input.scheduledFor } : {}) },
    });
    assertOk("campaign_events insert", eventError);
  }
}

export type TransitionInput = {
  dispatchId: string;
  to: DispatchStatus;
  operator: string;
  note?: string;
  scheduledFor?: string;
  tenant?: AgentTaskTenantFields;
};

/** Move a dispatch to a new status, stamping timestamps and logging an event.
 *  Operator-driven — the app never performs a real send. */
export async function transitionDispatch(input: TransitionInput, client: SupabaseClient): Promise<void> {
  const { dispatchId, to, operator, note, scheduledFor, tenant } = input;
  if (!DISPATCH_STATUS_ORDER.includes(to)) {
    throw new Error(`Unknown dispatch status: ${to}`);
  }

  const { data: existing, error: lookupError } = await applyOrgScope(
    client
      .from("campaign_dispatches")
      .select("id,campaign_id,status")
      .eq("id", dispatchId),
    tenant,
  ).maybeSingle<{ id: string; campaign_id: string; status: string }>();
  assertOk("campaign_dispatches lookup", lookupError);
  if (!existing) throw new Error("Dispatch not found.");

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === "sent" || to === "delivered") patch.dispatched_at = new Date().toISOString();
  if (to === "scheduled" && scheduledFor) patch.scheduled_for = scheduledFor;
  if (note) patch.result_note = note;

  const { error: updateError } = await applyOrgScope(client.from("campaign_dispatches").update(patch).eq("id", dispatchId), tenant);
  assertOk("campaign_dispatches update", updateError);

  const eventType = EVENT_FOR_STATUS[to];
  if (eventType) {
    const { error: eventError } = await client.from("campaign_events").insert({
      ...orgTenantFields(tenant),
      campaign_id: existing.campaign_id,
      event_type: eventType,
      actor: operator,
      detail: note ?? `Dispatch marked ${to} by ${operator}.`,
      payload: { dispatch_id: dispatchId, from: existing.status, to },
    });
    assertOk("campaign_events insert", eventError);
  }
}

function applyOrgScope<Query>(query: Query, tenant?: AgentTaskTenantFields): Query {
  if (!tenant) return query;
  return (query as { eq(column: string, value: string): Query }).eq("org_id", tenant.org_id);
}

function orgTenantFields(tenant?: AgentTaskTenantFields): Record<string, string> {
  return tenant ? { org_id: tenant.org_id } : {};
}
