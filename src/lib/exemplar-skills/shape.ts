/**
 * Pure row → `ExemplarCandidate` shaping for the exemplar-skill generator.
 *
 * Split out from `read-model.ts` so the interesting decisions — which body counts
 * as "the copy that shipped", what makes an approval *unedited*, how a revision
 * is counted — are unit-testable against fixtures with no Supabase in the way.
 * The I/O half only fetches and hands rows here.
 */

import {
  normalizeCampaignAssetType,
  TOUCH_KINDS,
  type ExemplarApproval,
  type ExemplarCandidate,
  type ExemplarEngagement,
  type ExemplarOutcome,
} from "@/domain";

/** `campaign_assets` columns this feature reads. */
export type CampaignAssetRow = {
  id: string;
  campaign_id: string;
  asset_type: string;
  channel: string | null;
  title: string | null;
  status: string;
  draft_body: string | null;
  edited_body: string | null;
  approved_body: string | null;
  approved_at: string | null;
  edited_fields: unknown;
};

/** `campaigns` columns — persona lives here, not on the asset. */
export type CampaignPersonaRow = { id: string; persona: string | null };

/** `campaign_events` rows for approval history. */
export type CampaignEventRow = {
  campaign_asset_id: string | null;
  event_type: string;
  payload: unknown;
};

/** `campaign_results` rows, already scoped to assets we care about. */
export type CampaignResultRow = {
  campaign_asset_id: string | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  jobs: number | null;
  won_revenue_cents: number | null;
  spend_cents: number | null;
};

/** `engagement_events` rows — one row per touch, counted into rates here. */
export type EngagementEventRow = {
  campaign_asset_id: string | null;
  event_type: string;
};

/** Asset statuses that count as an operator rejection. */
const DECLINED_STATUSES = new Set(["declined", "rejected"]);

/** Asset statuses that count as an operator approval. */
const APPROVED_STATUSES = new Set(["approved"]);

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The copy that actually shipped, most-authoritative first. `approved_body` is
 * what a human signed off on; `edited_body` is their rewrite awaiting sign-off;
 * `draft_body` is Arc's original. Anything below approved is only ever used at
 * the approval tier, where the caller already knows the evidence is soft.
 */
export function resolveShippedBody(row: CampaignAssetRow): string | null {
  for (const candidate of [row.approved_body, row.edited_body, row.draft_body]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/**
 * True when a human approved the copy without touching it. Checks BOTH
 * `edited_body` and `edited_fields` — an operator can edit a subject line or CTA
 * without rewriting the body, and that still isn't an untouched approval.
 */
export function wasApprovedUnchanged(row: CampaignAssetRow): boolean {
  if (!APPROVED_STATUSES.has(row.status)) return false;
  if (typeof row.edited_body === "string" && row.edited_body.trim().length > 0) return false;
  return !hasEditedFields(row.edited_fields);
}

function hasEditedFields(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

/**
 * Count revision rounds from the decision log. `requestAssetRevision` writes an
 * `approval_decided` event carrying `payload.decision = "revision_requested"`, so
 * that pair is the contract — a status check alone would miss assets that were
 * sent back twice and then approved.
 */
export function countRevisions(events: CampaignEventRow[]): number {
  let count = 0;
  for (const event of events) {
    if (event.event_type !== "approval_decided") continue;
    const payload = event.payload;
    if (!payload || typeof payload !== "object") continue;
    const decision = (payload as Record<string, unknown>).decision;
    if (decision === "revision_requested") count += 1;
  }
  return count;
}

export function summarizeApproval(row: CampaignAssetRow, events: CampaignEventRow[]): ExemplarApproval {
  return {
    approved: APPROVED_STATUSES.has(row.status),
    approvedUnchanged: wasApprovedUnchanged(row),
    revisionCount: countRevisions(events),
    declined: DECLINED_STATUSES.has(row.status),
  };
}

/** Sum every result period recorded against one asset into a single outcome. */
export function summarizeOutcome(rows: CampaignResultRow[]): ExemplarOutcome | null {
  if (rows.length === 0) return null;
  const total: ExemplarOutcome = {
    impressions: 0,
    clicks: 0,
    leads: 0,
    jobs: 0,
    wonRevenueCents: 0,
    spendCents: 0,
  };
  for (const row of rows) {
    total.impressions += num(row.impressions);
    total.clicks += num(row.clicks);
    total.leads += num(row.leads);
    total.jobs += num(row.jobs);
    total.wonRevenueCents += num(row.won_revenue_cents);
    total.spendCents += num(row.spend_cents);
  }
  return total;
}

/**
 * Fold raw touch rows into send/open/click counts. Matches the tolerant
 * substring style `journey/read-model.ts` already uses, so a provider that
 * reports `email_opened` instead of `email_open` still counts — an
 * under-counted denominator would silently inflate a click rate.
 */
export function summarizeEngagement(rows: EngagementEventRow[]): ExemplarEngagement | null {
  if (rows.length === 0) return null;
  const totals: ExemplarEngagement = { sends: 0, opens: 0, clicks: 0 };
  for (const row of rows) {
    const type = (row.event_type ?? "").toLowerCase();
    // Order matters: "email_click" contains neither "sent" nor "open", but check
    // click first anyway so a future "click_after_open" can't double-count.
    if (type.includes("click")) totals.clicks += 1;
    else if (type.includes("open")) totals.opens += 1;
    else if (type.includes("sent") || type === TOUCH_KINDS.SmsSent) totals.sends += 1;
  }
  return totals;
}

export type ShapeCandidatesInput = {
  assets: CampaignAssetRow[];
  personaByCampaignId: Map<string, string | null>;
  eventsByAssetId: Map<string, CampaignEventRow[]>;
  resultsByAssetId: Map<string, CampaignResultRow[]>;
  engagementByAssetId: Map<string, EngagementEventRow[]>;
};

/**
 * Shape joined rows into candidates. Assets with no copy or an unresolvable
 * asset type are dropped here rather than passed along as empty candidates —
 * the domain layer's refusal threshold should reflect real usable examples.
 */
export function shapeCandidates(input: ShapeCandidatesInput): ExemplarCandidate[] {
  const candidates: ExemplarCandidate[] = [];
  for (const row of input.assets) {
    const body = resolveShippedBody(row);
    if (!body) continue;
    const assetType = normalizeCampaignAssetType(row.asset_type);
    if (!assetType) continue;

    const events = input.eventsByAssetId.get(row.id) ?? [];
    const results = input.resultsByAssetId.get(row.id) ?? [];
    const engagement = input.engagementByAssetId.get(row.id) ?? [];

    candidates.push({
      assetId: row.id,
      assetType,
      channel: row.channel,
      persona: input.personaByCampaignId.get(row.campaign_id) ?? null,
      title: row.title?.trim() || "Untitled asset",
      body,
      draftBody: row.draft_body,
      approvedAt: row.approved_at,
      outcome: summarizeOutcome(results),
      engagement: summarizeEngagement(engagement),
      approval: summarizeApproval(row, events),
    });
  }
  return candidates;
}

/** Group rows by their `campaign_asset_id`, dropping rows that carry none. */
export function groupByAssetId<T extends { campaign_asset_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.campaign_asset_id) continue;
    const existing = map.get(row.campaign_asset_id);
    if (existing) existing.push(row);
    else map.set(row.campaign_asset_id, [row]);
  }
  return map;
}
