/**
 * Which pending opportunities a scheduled pass may draft without being asked.
 *
 * Arc's loop was automated up to the opportunity and stopped there: a daily scan
 * proposes opportunities, but turning one into a campaign draft required a human
 * click. The result was 69 pending opportunities and one draft ever. Drafting is
 * work, not a decision — a draft reaches nobody, and the outbound gate sits at
 * send — so the scan is allowed to fill the review queue.
 *
 * Pure — no I/O. The caller reads pending rows and enqueues the existing
 * approval-gated draft path for whatever this returns.
 *
 * This selects *what to draft*, never *what to send*. Everything it picks lands
 * in the same review queue as an operator-requested draft and stays there.
 *
 * Two properties matter more than cleverness here:
 *
 *  1. **It is bounded.** A pass drafts at most `limit`. Turning 69 pending
 *     opportunities into 69 drafts overnight would bury the review queue and
 *     make the feature its own denial-of-service.
 *  2. **It never double-drafts.** An opportunity already linked to a campaign is
 *     skipped, so a re-run — or a cron that fires twice — cannot fork a second
 *     campaign off the same opportunity.
 */

/**
 * Confidence is an integer 0-100 on `opportunities.confidence`, not a 0-1 float.
 *
 * 65 rather than a stricter 80 deliberately: at 80 the only kind that clears is
 * `crm_inactivity` (19 of the top 20 on real data), so a stricter floor buys a
 * monoculture, not quality. 65 lets storm response, competitor signals, and
 * partner-network work compete. Expect some of these to be declined — that is
 * the cost of variety, and a decline is still signal the exemplar generator uses.
 */
export const DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR = 65;

/**
 * Drafts per scheduled pass. Deliberately small: the queue is reviewed by a
 * human, and a backlog nobody can work through is worth less than three drafts
 * they actually read. The backlog drains over successive days.
 */
export const DEFAULT_AUTO_DRAFT_LIMIT = 3;

/**
 * One draft per opportunity kind per pass. Paired with the lower floor above:
 * without it, confidence ranking fills every pass with the same kind.
 */
export const DEFAULT_AUTO_DRAFT_MAX_PER_KIND = 1;

/** Only a genuinely untouched opportunity is eligible. */
const ELIGIBLE_STATUS = "pending";

export type AutoDraftUrgency = "low" | "medium" | "high";

export type AutoDraftCandidate = {
  id: string;
  /** 0-100 integer. */
  confidence: number;
  urgency: AutoDraftUrgency;
  status: string;
  /** Grouping key so one pass doesn't draft five campaigns at the same company. */
  subjectType: string;
  subjectId: string;
  kind: string;
  /** Set once converted. Non-null means "already drafted" — never draft again. */
  campaignId: string | null;
  /** ISO timestamp; a live snooze suppresses regardless of confidence. */
  snoozedUntil?: string | null;
  /** ISO timestamp the opportunity was detected. Older drains first. */
  detectedAt: string;
};

export type AutoDraftSkipReason =
  | "not_pending"
  | "already_drafted"
  | "snoozed"
  | "below_confidence_floor"
  | "duplicate_subject"
  | "kind_quota"
  | "over_limit";

export type AutoDraftSelection = {
  selected: AutoDraftCandidate[];
  /** Why each candidate was passed over — so a pass that drafts nothing says why. */
  skipped: Array<{ id: string; reason: AutoDraftSkipReason }>;
};

export type SelectAutoDraftInput = {
  candidates: AutoDraftCandidate[];
  /** Injected so a live snooze is evaluated deterministically. */
  now: Date;
  confidenceFloor?: number;
  limit?: number;
  /**
   * Cap on drafts sharing one opportunity `kind` per pass. Undefined = no cap;
   * callers should normally pass `DEFAULT_AUTO_DRAFT_MAX_PER_KIND`.
   *
   * Worth setting: on real data, ranking by confidence alone produces a
   * monoculture. 19 of the top 20 pending opportunities are `crm_inactivity`,
   * so an uncapped pass drafts the same "re-engage a dormant lead" campaign
   * every day while storm response, competitor signals, and partner-network
   * work — all below the confidence floor — never get drafted at all.
   */
  maxPerKind?: number;
};

const URGENCY_RANK: Record<AutoDraftUrgency, number> = { high: 0, medium: 1, low: 2 };

function isSnoozed(candidate: AutoDraftCandidate, now: Date): boolean {
  if (!candidate.snoozedUntil) return false;
  const until = Date.parse(candidate.snoozedUntil);
  // An unparseable snooze is treated as active: suppressing one draft is a far
  // cheaper mistake than drafting against something the operator set aside.
  if (Number.isNaN(until)) return true;
  return until > now.getTime();
}

/**
 * Rank by confidence, then urgency, then age (oldest first so a backlog drains
 * rather than the newest work perpetually jumping the queue), then id for
 * stability.
 */
function compareCandidates(a: AutoDraftCandidate, b: AutoDraftCandidate): number {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  const urgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (urgency !== 0) return urgency;
  if (a.detectedAt !== b.detectedAt) return a.detectedAt < b.detectedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function subjectKey(candidate: AutoDraftCandidate): string {
  return `${candidate.subjectType}:${candidate.subjectId}`;
}

/**
 * Pick the opportunities a scheduled pass should draft. Returns both the
 * selection and the reason every other candidate was passed over.
 */
export function selectOpportunitiesForAutoDraft(input: SelectAutoDraftInput): AutoDraftSelection {
  const floor = input.confidenceFloor ?? DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR;
  const limit = input.limit ?? DEFAULT_AUTO_DRAFT_LIMIT;

  const selected: AutoDraftCandidate[] = [];
  const skipped: AutoDraftSelection["skipped"] = [];

  if (limit <= 0) {
    return { selected, skipped: input.candidates.map((c) => ({ id: c.id, reason: "over_limit" as const })) };
  }

  const eligible: AutoDraftCandidate[] = [];
  for (const candidate of input.candidates) {
    // Order matters for the reported reason: "already drafted" is more useful
    // than "not pending" for an opportunity that is both.
    if (candidate.campaignId) skipped.push({ id: candidate.id, reason: "already_drafted" });
    else if (candidate.status !== ELIGIBLE_STATUS) skipped.push({ id: candidate.id, reason: "not_pending" });
    else if (isSnoozed(candidate, input.now)) skipped.push({ id: candidate.id, reason: "snoozed" });
    else if (candidate.confidence < floor) skipped.push({ id: candidate.id, reason: "below_confidence_floor" });
    else eligible.push(candidate);
  }

  const seenSubjects = new Set<string>();
  const perKind = new Map<string, number>();
  for (const candidate of [...eligible].sort(compareCandidates)) {
    if (seenSubjects.has(subjectKey(candidate))) {
      skipped.push({ id: candidate.id, reason: "duplicate_subject" });
      continue;
    }
    if (input.maxPerKind !== undefined && (perKind.get(candidate.kind) ?? 0) >= input.maxPerKind) {
      skipped.push({ id: candidate.id, reason: "kind_quota" });
      continue;
    }
    if (selected.length >= limit) {
      skipped.push({ id: candidate.id, reason: "over_limit" });
      continue;
    }
    seenSubjects.add(subjectKey(candidate));
    perKind.set(candidate.kind, (perKind.get(candidate.kind) ?? 0) + 1);
    selected.push(candidate);
  }

  return { selected, skipped };
}

/** Counts per skip reason — for the cron response, so a quiet pass is legible. */
export function summarizeAutoDraftSkips(selection: AutoDraftSelection): Record<AutoDraftSkipReason, number> {
  const summary: Record<AutoDraftSkipReason, number> = {
    not_pending: 0,
    already_drafted: 0,
    snoozed: 0,
    below_confidence_floor: 0,
    duplicate_subject: 0,
    kind_quota: 0,
    over_limit: 0,
  };
  for (const skip of selection.skipped) summary[skip.reason] += 1;
  return summary;
}
