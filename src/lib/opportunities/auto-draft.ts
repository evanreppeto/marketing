import "server-only";

/**
 * Scheduled auto-drafting: let the daily scan fill the review queue instead of
 * waiting for an operator to click "Draft campaign" on each opportunity.
 *
 * Arc's loop was automated up to the opportunity and stopped there — 111
 * opportunities proposed, one draft ever. Drafting is work, not a decision: a
 * draft reaches nobody, and the outbound gate sits at send. So a scheduled pass
 * is allowed to draft, and every draft lands in the same approval queue as one
 * an operator asked for.
 *
 * **This never sends anything.** It reuses the exact path
 * `askArcToDraftFromOpportunityAction` uses — a launch-locked draft campaign
 * plus an Arc package run — minus the human click. `ARC_SEND_ENABLED` and the
 * per-asset approval gate are untouched and still stand between a draft and a
 * recipient.
 *
 * Off unless `OPPORTUNITY_AUTO_DRAFT_ENABLED=1`. Set
 * `OPPORTUNITY_AUTO_DRAFT_DRY_RUN=1` to report exactly what a pass *would* draft
 * without writing anything — the intended way to see this run against a live
 * backlog before it is allowed to create campaigns.
 */

import {
  buildCampaignSeedFromOpportunity,
  DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR,
  DEFAULT_AUTO_DRAFT_LIMIT,
  DEFAULT_AUTO_DRAFT_MAX_PER_KIND,
  isAllowedPersona,
  selectOpportunitiesForAutoDraft,
  summarizeAutoDraftSkips,
  type AutoDraftCandidate,
  type AutoDraftSkipReason,
} from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { createCampaignFromOpportunity } from "@/lib/campaigns/create";
import { getOrgPersonaKeys } from "@/lib/personas/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { executeOpportunityDraftTask } from "./draft-package";
import { enqueueArcOpportunityTask } from "./enqueue";
import { markOpportunityDrafted, markOpportunityDrafting } from "./persistence";
import { getOpportunityForCampaign } from "./read-model";

/** The actor recorded on scheduled drafts, so they're distinguishable in the audit log. */
export const AUTO_DRAFT_ACTOR = "Arc (scheduled)";

/** What a dry run would have created, in enough detail to judge it. */
export type PlannedDraft = {
  opportunityId: string;
  title: string;
  kind: string;
  confidence: number;
  urgency: string;
  /** The campaign name that would be created. */
  name: string;
  persona: string;
  theme: string;
};

export type AutoDraftRunSummary = {
  ran: boolean;
  /** True when nothing was written — `wouldDraft` shows what a live pass would do. */
  dryRun: boolean;
  /** Why the pass did nothing, when it did nothing. */
  skipped?: "disabled" | "not_configured" | "no_org" | "no_candidates";
  considered: number;
  selected: number;
  drafted: number;
  failed: number;
  /** Opportunities picked but unusable (e.g. no persona Arc could resolve). */
  unusable: number;
  skips?: Record<AutoDraftSkipReason, number>;
  campaignIds: string[];
  /** Populated only on a dry run. */
  wouldDraft: PlannedDraft[];
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type PendingRow = {
  id: string;
  confidence: number | null;
  urgency: string | null;
  status: string;
  subject_type: string;
  subject_id: string;
  kind: string;
  campaign_id: string | null;
  snoozed_until: string | null;
  created_at: string;
  evidence: unknown;
};

/**
 * The persona an opportunity carries. It lives in `evidence.persona`, not a
 * column — `opportunities` has none.
 */
function personaFromEvidence(evidence: unknown): string {
  if (!evidence || typeof evidence !== "object") return "";
  const value = (evidence as Record<string, unknown>).persona;
  return typeof value === "string" ? value.trim() : "";
}

function toCandidate(row: PendingRow, allowedPersonaKeys: string[]): AutoDraftCandidate {
  return {
    id: row.id,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    urgency: row.urgency === "high" || row.urgency === "low" ? row.urgency : "medium",
    status: row.status,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    kind: row.kind,
    campaignId: row.campaign_id,
    // Resolved up front so unusable candidates never consume the daily limit.
    hasPersona: isAllowedPersona(personaFromEvidence(row.evidence), allowedPersonaKeys),
    snoozedUntil: row.snoozed_until,
    detectedAt: row.created_at,
  };
}

/**
 * Draft the top pending opportunities for the current workspace. Every step is
 * best-effort per opportunity: one failure records and moves on rather than
 * aborting the pass, so a single bad opportunity can't stall the queue forever.
 */
export async function runScheduledAutoDraft(
  now: Date = new Date(),
  options: { dryRun?: boolean } = {},
): Promise<AutoDraftRunSummary> {
  // Either the caller or the environment can force a dry run; neither can turn
  // one off once requested.
  const dryRun = options.dryRun === true || process.env.OPPORTUNITY_AUTO_DRAFT_DRY_RUN === "1";
  const empty: AutoDraftRunSummary = {
    ran: false,
    dryRun,
    considered: 0,
    selected: 0,
    drafted: 0,
    failed: 0,
    unusable: 0,
    campaignIds: [],
    wouldDraft: [],
  };

  if (process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED !== "1") return { ...empty, skipped: "disabled" };
  if (!isSupabaseAdminConfigured()) return { ...empty, skipped: "not_configured" };

  const tenant = await getCurrentAgentTaskTenantFields();
  const orgId = tenant.org_id;
  if (!orgId) return { ...empty, skipped: "no_org" };

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("opportunities")
    .select("id,confidence,urgency,status,subject_type,subject_id,kind,campaign_id,snoozed_until,created_at,evidence")
    .eq("org_id", orgId)
    .eq("status", "pending");
  if (error) throw new Error(`opportunities: ${error.message}`);

  // Fetched before selection so the persona gate can run inside it rather than
  // downstream, where a skip would already have cost a slot.
  const allowedPersonaKeys = await getOrgPersonaKeys(orgId);

  const candidates = ((data ?? []) as PendingRow[]).map((row) => toCandidate(row, allowedPersonaKeys));
  if (candidates.length === 0) return { ...empty, ran: true, skipped: "no_candidates" };

  const selection = selectOpportunitiesForAutoDraft({
    candidates,
    now,
    confidenceFloor: envInt("OPPORTUNITY_AUTO_DRAFT_FLOOR", DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR),
    limit: envInt("OPPORTUNITY_AUTO_DRAFT_LIMIT", DEFAULT_AUTO_DRAFT_LIMIT),
    maxPerKind: envInt("OPPORTUNITY_AUTO_DRAFT_MAX_PER_KIND", DEFAULT_AUTO_DRAFT_MAX_PER_KIND),
  });

  const summary: AutoDraftRunSummary = {
    ...empty,
    ran: true,
    considered: candidates.length,
    selected: selection.selected.length,
    skips: summarizeAutoDraftSkips(selection),
  };

  if (selection.selected.length === 0) return summary;

  for (const candidate of selection.selected) {
    try {
      const opp = await getOpportunityForCampaign(candidate.id, orgId, client);
      // Re-read guards against a race: an operator may have drafted or dismissed
      // this between the select above and now.
      if (!opp || opp.campaignId) {
        summary.unusable += 1;
        continue;
      }

      const seed = buildCampaignSeedFromOpportunity(
        {
          title: opp.title,
          summary: opp.summary,
          recommendedAction: opp.recommendedAction,
          urgency: opp.urgency,
          persona: opp.persona,
          recommendedCampaignType: opp.recommendedCampaignType,
        },
        allowedPersonaKeys,
      );

      // Defense in depth: selection already gated on a resolvable persona, but
      // the seed builder may still land on one the workspace does not allow.
      // Leave it pending rather than guessing a persona for the operator.
      if (!seed.persona || !isAllowedPersona(seed.persona, allowedPersonaKeys)) {
        summary.unusable += 1;
        continue;
      }

      // Everything above this line is a read. A dry run stops here, having
      // exercised selection, the re-read, seed derivation, and persona
      // validation — the parts that decide *what* would be drafted.
      if (dryRun) {
        summary.wouldDraft.push({
          opportunityId: opp.id,
          title: opp.title,
          kind: candidate.kind,
          confidence: opp.confidence,
          urgency: opp.urgency,
          name: seed.name,
          persona: seed.persona,
          theme: seed.campaignTheme || seed.restorationFocus || "(none)",
        });
        continue;
      }

      const { campaignId } = await createCampaignFromOpportunity({
        operator: AUTO_DRAFT_ACTOR,
        name: seed.name,
        persona: seed.persona,
        ...(seed.campaignTheme ? { campaignTheme: seed.campaignTheme } : { restorationFocus: seed.restorationFocus }),
        objective: opp.recommendedAction,
        audienceSummary: seed.audienceSummary,
        opportunity: {
          id: opp.id,
          subjectType: opp.subjectType,
          subjectId: opp.subjectId,
          confidence: opp.confidence,
          urgency: opp.urgency,
          recommendedAction: opp.recommendedAction,
        },
        client,
        tenant,
      });

      summary.campaignIds.push(campaignId);

      try {
        const taskId = await enqueueArcOpportunityTask(
          {
            opportunityId: opp.id,
            objective: `Draft a campaign package for: ${opp.recommendedAction}`,
            operator: AUTO_DRAFT_ACTOR,
            campaignId,
            brief: {
              title: opp.title,
              angle: opp.recommendedAction,
              personaLabel: seed.persona,
              focusLabel: seed.campaignTheme || seed.restorationFocus,
              urgency: opp.urgency,
              subjectLabel: opp.subjectType,
            },
          },
          client,
        );
        await markOpportunityDrafting(opp.id, taskId, client, { orgId }).catch(() => {});
        await executeOpportunityDraftTask({ agentTaskId: taskId, orgId, agentName: "Arc" });
      } catch {
        // No Arc agent registered, or the package run failed: the draft shell
        // exists, so settle the opportunity rather than leaving it stuck in
        // "drafting" forever.
        await markOpportunityDrafted(opp.id, campaignId, client, { orgId }).catch(() => {});
      }

      summary.drafted += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
