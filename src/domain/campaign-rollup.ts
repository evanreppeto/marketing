/**
 * Pure roll-up of a campaign's per-piece approval state. A campaign bundles many
 * independently-approvable deliverables; this distills their statuses into one
 * action-first headline + a breakdown, with no I/O. The read-model resolves each
 * piece's effective status and calls this; the UI renders the result.
 */

export type CampaignStatusBucket = "approved" | "pending" | "changes" | "draft" | "archived";

export type CampaignRollupState =
  | "needs_review"
  | "ready"
  | "in_progress"
  | "changes_requested"
  | "drafting"
  | "empty";

export type CampaignRollup = {
  state: CampaignRollupState;
  label: string;
  approved: number;
  pending: number;
  changes: number;
  draft: number;
  /** Non-archived pieces (the breakdown denominator). */
  total: number;
};

const PENDING = new Set(["pending_approval", "pending_owner_approval", "needs_compliance"]);
const CHANGES = new Set(["revision_requested", "declined", "rejected", "blocked"]);

/** Map one raw DB status string to a coarse bucket. Unknown statuses are treated as draft. */
export function bucketCampaignStatus(status: string): CampaignStatusBucket {
  const s = status.toLowerCase().trim();
  if (s === "approved") return "approved";
  if (s === "archived") return "archived";
  if (PENDING.has(s)) return "pending";
  if (CHANGES.has(s)) return "changes";
  return "draft";
}

/**
 * Derive a campaign's roll-up from its pieces' raw statuses. Priority ladder
 * (first match wins): pending > all-approved > some-approved > changes > draft > empty.
 */
export function deriveCampaignRollup(statuses: string[]): CampaignRollup {
  let approved = 0;
  let pending = 0;
  let changes = 0;
  let draft = 0;

  for (const status of statuses) {
    const bucket = bucketCampaignStatus(status);
    if (bucket === "approved") approved += 1;
    else if (bucket === "pending") pending += 1;
    else if (bucket === "changes") changes += 1;
    else if (bucket === "draft") draft += 1;
    // "archived" is excluded from the breakdown
  }

  const total = approved + pending + changes + draft;
  const counts = { approved, pending, changes, draft, total };

  if (pending > 0) {
    return { state: "needs_review", label: `Needs your review · ${pending} pending`, ...counts };
  }
  if (total > 0 && approved === total) {
    return { state: "ready", label: "Ready to launch", ...counts };
  }
  if (approved > 0) {
    return { state: "in_progress", label: `In progress · ${approved} of ${total} approved`, ...counts };
  }
  if (changes > 0) {
    return { state: "changes_requested", label: `Changes requested · ${changes}`, ...counts };
  }
  if (draft > 0) {
    return { state: "drafting", label: "Drafting", ...counts };
  }
  return { state: "empty", label: "No deliverables yet", ...counts };
}
