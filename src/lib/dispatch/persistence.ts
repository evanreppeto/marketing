import { type SupabaseClient } from "@supabase/supabase-js";

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

export type EnqueueInput = { campaignId: string; assetIds: string[]; operator: string };

/** Insert one queued dispatch per approved asset. Called from the launch flow
 *  after assets are unlocked. No-op for an empty list. */
export async function enqueueDispatchesForAssets(input: EnqueueInput, client: SupabaseClient): Promise<void> {
  const { campaignId, assetIds, operator } = input;
  if (assetIds.length === 0) return;

  const { data: assetRows, error: assetError } = await client
    .from("campaign_assets")
    .select("id,channel,title")
    .in("id", assetIds);
  assertOk("campaign_assets lookup", assetError);
  const assets = (assetRows ?? []) as Array<{ id: string; channel: string | null; title: string }>;

  for (const asset of assets) {
    const { error: insertError } = await client.from("campaign_dispatches").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      channel: asset.channel,
      status: "queued",
      payload: { source: "campaign_launch", deliverable: asset.title },
    });
    assertOk("campaign_dispatches insert", insertError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      event_type: "dispatch_queued",
      actor: operator,
      detail: `Queued "${asset.title}" for dispatch.`,
      payload: { channel: asset.channel },
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
};

/** Move a dispatch to a new status, stamping timestamps and logging an event.
 *  Operator-driven — the app never performs a real send. */
export async function transitionDispatch(input: TransitionInput, client: SupabaseClient): Promise<void> {
  const { dispatchId, to, operator, note, scheduledFor } = input;
  if (!DISPATCH_STATUS_ORDER.includes(to)) {
    throw new Error(`Unknown dispatch status: ${to}`);
  }

  const { data: existing, error: lookupError } = await client
    .from("campaign_dispatches")
    .select("id,campaign_id,status")
    .eq("id", dispatchId)
    .maybeSingle<{ id: string; campaign_id: string; status: string }>();
  assertOk("campaign_dispatches lookup", lookupError);
  if (!existing) throw new Error("Dispatch not found.");

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === "sent" || to === "delivered") patch.dispatched_at = new Date().toISOString();
  if (to === "scheduled" && scheduledFor) patch.scheduled_for = scheduledFor;
  if (note) patch.result_note = note;

  const { error: updateError } = await client.from("campaign_dispatches").update(patch).eq("id", dispatchId);
  assertOk("campaign_dispatches update", updateError);

  const eventType = EVENT_FOR_STATUS[to];
  if (eventType) {
    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: existing.campaign_id,
      event_type: eventType,
      actor: operator,
      detail: note ?? `Dispatch marked ${to} by ${operator}.`,
      payload: { dispatch_id: dispatchId, from: existing.status, to },
    });
    assertOk("campaign_events insert", eventError);
  }
}
