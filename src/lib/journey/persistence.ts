import { randomUUID } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";

import { resolveAttribution, type NormalizedCollect } from "@/domain";

/**
 * Journey P1 persistence — anonymous touch capture + identity stitch.
 *
 * Every write here runs through the service-role client (anonymous browsers have
 * no session), so the ORG IS NEVER TAKEN FROM THE CLIENT. `resolveCollectOrg`
 * derives it from the signed campaign token; a body that resolves to no real
 * campaign is rejected upstream (400) and nothing is written.
 */

export type ResolvedCollectOrg = { orgId: string; campaignId: string; assetId: string | null; channel: string | null };

/**
 * Resolve the owning org from the collector body's campaign token (or explicit
 * campaignId). Returns null when the token decodes to nothing or the campaign
 * doesn't exist — the caller turns that into a 400 so a random beacon can't write.
 */
export async function resolveCollectOrg(
  supabase: SupabaseClient,
  input: Pick<NormalizedCollect, "token" | "campaignId" | "assetId" | "channel">,
): Promise<ResolvedCollectOrg | null> {
  let campaignId = input.campaignId;
  let assetId = input.assetId;
  let channel = input.channel;
  if (!campaignId && input.token) {
    const resolved = resolveAttribution({ token: input.token });
    campaignId = resolved.campaignId;
    assetId = assetId ?? resolved.assetId;
    channel = channel ?? resolved.channel;
  }
  if (!campaignId) return null;

  const { data, error } = await supabase.from("campaigns").select("org_id").eq("id", campaignId).maybeSingle();
  if (error || !data?.org_id) return null;
  return { orgId: data.org_id as string, campaignId, assetId: assetId ?? null, channel: channel ?? null };
}

export type RecordedTouch = { identityId: string; anonymousId: string; touchpointId: string | null; deduped: boolean };

/**
 * Upsert the anonymous identity (by org + anonymous_id) and append a touchpoint.
 * Mints an anonymous_id when the visitor is new. Idempotent on `externalRef`:
 * a retried beacon with the same ref is a no-op (deduped: true).
 */
export async function recordCollectedTouch(args: {
  supabase: SupabaseClient;
  resolved: ResolvedCollectOrg;
  input: NormalizedCollect;
  nowMs?: number;
}): Promise<RecordedTouch> {
  const { supabase, resolved, input } = args;
  const nowMs = args.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const anonymousId = input.anonymousId ?? randomUUID();

  // Upsert identity by (org_id, anonymous_id).
  const existing = await supabase
    .from("journey_identities")
    .select("id")
    .eq("org_id", resolved.orgId)
    .eq("anonymous_id", anonymousId)
    .maybeSingle();
  if (existing.error) throw new Error(`journey_identities lookup: ${existing.error.message}`);

  let identityId: string;
  if (existing.data?.id) {
    identityId = existing.data.id as string;
    await supabase.from("journey_identities").update({ last_seen_at: nowIso, updated_at: nowIso }).eq("id", identityId);
  } else {
    const created = await supabase
      .from("journey_identities")
      .insert({ org_id: resolved.orgId, anonymous_id: anonymousId, resolution: "anonymous", first_seen_at: nowIso, last_seen_at: nowIso })
      .select("id")
      .single();
    if (created.error || !created.data) throw new Error(`journey_identities insert: ${created.error?.message ?? "no row"}`);
    identityId = created.data.id as string;
  }

  // Clamp the touch time: never trust a future or unparseable client timestamp.
  const suppliedMs = input.occurredAt ? Date.parse(input.occurredAt) : NaN;
  const occurredAt = !Number.isNaN(suppliedMs) && suppliedMs <= nowMs ? new Date(suppliedMs).toISOString() : nowIso;

  const insert = await supabase
    .from("journey_touchpoints")
    .insert({
      org_id: resolved.orgId,
      identity_id: identityId,
      occurred_at: occurredAt,
      kind: input.kind,
      direction: input.direction,
      channel: resolved.channel ?? input.channel,
      campaign_id: resolved.campaignId,
      campaign_asset_id: resolved.assetId ?? input.assetId,
      summary: input.summary ?? input.path,
      is_conversion: false,
      source: "collector",
      external_ref: input.externalRef,
    })
    .select("id")
    .single();

  if (insert.error) {
    // Unique (org_id, external_ref) violation → the beacon was already recorded.
    if (insert.error.code === "23505") return { identityId, anonymousId, touchpointId: null, deduped: true };
    throw new Error(`journey_touchpoints insert: ${insert.error.message}`);
  }
  return { identityId, anonymousId, touchpointId: (insert.data?.id as string) ?? null, deduped: false };
}

export type StitchResult = { stitched: boolean; touchpoints: number };

/**
 * The identity stitch: at identification, merge an anonymous identity's whole
 * history onto a known contact. Sets the identity to `stitched` and denormalizes
 * contact_id onto its touchpoints. No-op (stitched: false) if the anonymous id
 * was never seen. Total — a stitch failure never blocks the identifying event.
 */
export async function stitchAnonymousToContact(args: {
  supabase: SupabaseClient;
  orgId: string;
  anonymousId: string;
  contactId: string;
  nowMs?: number;
}): Promise<StitchResult> {
  const { supabase, orgId, anonymousId, contactId } = args;
  const nowIso = new Date(args.nowMs ?? Date.now()).toISOString();

  const identity = await supabase
    .from("journey_identities")
    .select("id")
    .eq("org_id", orgId)
    .eq("anonymous_id", anonymousId)
    .maybeSingle();
  if (identity.error || !identity.data?.id) return { stitched: false, touchpoints: 0 };
  const identityId = identity.data.id as string;

  await supabase
    .from("journey_identities")
    .update({ contact_id: contactId, resolution: "stitched", updated_at: nowIso })
    .eq("id", identityId);

  const updated = await supabase
    .from("journey_touchpoints")
    .update({ contact_id: contactId })
    .eq("org_id", orgId)
    .eq("identity_id", identityId)
    .select("id");

  return { stitched: true, touchpoints: updated.data?.length ?? 0 };
}
