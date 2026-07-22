/**
 * Turn a workspace's own best campaign copy into a reusable exemplar skill.
 *
 * The premise (and the reason this exists at all): a model can't verify whether
 * copy is *good* the way it can verify whether code compiles, so instructions
 * alone don't move content quality — worked examples do. Arc already records
 * which assets a workspace approved, edited, and converted on; this module turns
 * that record into a SKILL.md the drafting path can load later.
 *
 * Pure — no I/O. The lib layer does the `campaign_assets` ⋈ `campaign_results`
 * read and the persistence; everything here is deterministic so exemplar choice
 * is unit-testable against fixtures.
 *
 * Two invariants worth stating, because both are failure modes we've shipped before:
 *
 *  1. **It refuses rather than invents.** Below `minExemplars` usable examples the
 *     result is `ok: false`. A skill built from two assets would read exactly as
 *     confident as one built from fifty, and the operator can't tell them apart
 *     downstream — so the thin case must not produce an artifact at all.
 *  2. **The evidence tier is disclosed in the rendered skill.** "These converted"
 *     and "a human approved these unedited" are very different claims. The reader
 *     (human or agent) always sees which one it's getting.
 *
 * Nothing here authorizes outbound anything. The generated skill shapes *drafts*,
 * which stay behind the same approval gate as every other draft.
 */

import { type CampaignAssetType } from "./campaign-assets";

/**
 * How strongly a candidate's ranking is grounded, strongest first. `outcome`
 * means real booked work; `engagement` means opens/clicks but no attributed
 * revenue; `approval` means no send data at all — only what a human did with the
 * draft. A whole selection resolves to ONE tier so its exemplars stay comparable.
 */
export const EVIDENCE_TIERS = ["outcome", "engagement", "approval"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

/** Outcome-tier metrics for one asset, from `campaign_results`. */
export type ExemplarOutcome = {
  impressions: number;
  clicks: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
};

/** Engagement-tier metrics for one asset, from `engagement_events`. */
export type ExemplarEngagement = {
  sends: number;
  opens: number;
  clicks: number;
};

/**
 * Approval-tier signal — the human-edit corpus. Available with zero sends, which
 * makes it the cold-start tier: it only needs an operator working the queue.
 */
export type ExemplarApproval = {
  /**
   * An operator approved it, edits or not. Required for any positive exemplar at
   * this tier: copy still sitting in the queue has no human endorsement, and a
   * revision request is evidence *against* it, not for it.
   */
  approved: boolean;
  /** Approved with no edit to the body. The strongest cheap positive signal. */
  approvedUnchanged: boolean;
  /** How many revision rounds the operator sent it back for. Ranking only. */
  revisionCount: number;
  /** Operator declined it outright — a counter-example, never an exemplar. */
  declined: boolean;
};

/** One campaign asset, already read and joined by the lib layer. */
export type ExemplarCandidate = {
  assetId: string;
  assetType: CampaignAssetType;
  channel: string | null;
  persona: string | null;
  title: string;
  /** The copy that shipped — approved body, else edited, else draft. */
  body: string;
  /** Arc's original draft when the human changed it. Used to show the edit delta. */
  draftBody?: string | null;
  /** ISO timestamp; recency is the stable tiebreak. */
  approvedAt?: string | null;
  outcome?: ExemplarOutcome | null;
  engagement?: ExemplarEngagement | null;
  approval?: ExemplarApproval | null;
};

export type SelectedExemplar = {
  candidate: ExemplarCandidate;
  /** One line explaining why this example ranked where it did, in the tier's own terms. */
  rationale: string;
  /** Body after per-example truncation; what actually goes in the skill. */
  body: string;
  truncated: boolean;
};

export type InsufficientEvidenceReason =
  | "no_candidates"
  | "no_usable_bodies"
  | "insufficient_evidence";

export type ExemplarSelection =
  | {
      ok: true;
      tier: EvidenceTier;
      exemplars: SelectedExemplar[];
      /** Declined or heavily-revised copy — shown as what NOT to do. May be empty. */
      counterExamples: SelectedExemplar[];
      /** Ranked in, then dropped to stay under the character budget. */
      skippedForBudget: number;
      /** Dropped as near-duplicates of a higher-ranked exemplar. */
      skippedAsDuplicate: number;
    }
  | {
      ok: false;
      reason: InsufficientEvidenceReason;
      /** Operator-facing explanation — this is shown, not swallowed. */
      detail: string;
      /** How many usable examples the strongest tier had, for "3 of 5 needed" copy. */
      usable: number;
      needed: number;
    };

/**
 * Below this, refuse. Three is already thin for pattern-matching prose, but it's
 * the point where a reader can at least see a repeated shape rather than a coincidence.
 */
export const DEFAULT_MIN_EXEMPLARS = 3;

/** Hard ceiling on exemplars — past this, more examples dilute rather than teach. */
export const DEFAULT_MAX_EXEMPLARS = 8;

/** Counter-examples are seasoning; too many turn the skill into a list of grievances. */
export const DEFAULT_MAX_COUNTER_EXAMPLES = 3;

/**
 * Character budget for all example bodies combined. Deliberately well under
 * `MAX_CUSTOM_SKILL_INSTRUCTIONS` (16k) so the rendered frontmatter, headers, and
 * guidance can't push the finished skill over the cap.
 */
export const DEFAULT_BODY_BUDGET_CHARS = 9_000;

/** Per-example cap, so one sprawling landing page can't crowd out five emails. */
export const MAX_EXEMPLAR_BODY_CHARS = 1_500;

/** At/above this Jaccard similarity two bodies count as the same example. */
export const DUPLICATE_SIMILARITY = 0.8;

/** Revised this many times or more ⇒ counter-example, not exemplar. */
export const HEAVY_REVISION_COUNT = 2;

/** Engagement rates from a handful of sends are noise; require real volume. */
export const MIN_SENDS_FOR_ENGAGEMENT = 50;

export type SelectExemplarsInput = {
  candidates: ExemplarCandidate[];
  /** Restrict to one asset type. Omit to consider every type together. */
  assetType?: CampaignAssetType;
  /** Restrict to one persona. Omit to consider every persona together. */
  persona?: string;
  minExemplars?: number;
  maxExemplars?: number;
  bodyBudgetChars?: number;
};

function normalizeForCompare(body: string): string[] {
  return body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard over word sets — cheap, order-insensitive, good enough to catch a re-send. */
function similarity(a: string, b: string): number {
  const left = new Set(normalizeForCompare(a));
  const right = new Set(normalizeForCompare(b));
  if (left.size === 0 || right.size === 0) return left.size === right.size ? 1 : 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function hasBody(candidate: ExemplarCandidate): boolean {
  return typeof candidate.body === "string" && candidate.body.trim().length > 0;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Outcome evidence only counts when the asset actually produced something. */
function hasOutcomeEvidence(candidate: ExemplarCandidate): boolean {
  const o = candidate.outcome;
  if (!o) return false;
  return o.jobs > 0 || o.leads > 0 || o.wonRevenueCents > 0;
}

function hasEngagementEvidence(candidate: ExemplarCandidate): boolean {
  const e = candidate.engagement;
  return !!e && e.sends >= MIN_SENDS_FOR_ENGAGEMENT;
}

/**
 * Approval evidence exists only where a human actually decided — approved, or
 * declined. Deliberately NOT "has a revision request": an asset sent back once
 * and still sitting in the queue is unendorsed copy, and counting it as a
 * positive exemplar would teach Arc from drafts nobody accepted.
 */
function hasApprovalEvidence(candidate: ExemplarCandidate): boolean {
  const a = candidate.approval;
  return !!a && (a.approved || a.declined);
}

function isCounterExample(candidate: ExemplarCandidate): boolean {
  const a = candidate.approval;
  if (!a) return false;
  return a.declined || a.revisionCount >= HEAVY_REVISION_COUNT;
}

function hasEvidenceForTier(candidate: ExemplarCandidate, tier: EvidenceTier): boolean {
  if (tier === "outcome") return hasOutcomeEvidence(candidate);
  if (tier === "engagement") return hasEngagementEvidence(candidate);
  return hasApprovalEvidence(candidate);
}

/**
 * Recency, then id. Only ever a tiebreak — never a ranking signal on its own,
 * or the skill drifts toward "whatever we wrote last" instead of what worked.
 */
function stableTiebreak(a: ExemplarCandidate, b: ExemplarCandidate): number {
  const at = a.approvedAt ?? "";
  const bt = b.approvedAt ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0;
}

/**
 * Rank within a tier by explicit precedence rather than a blended score. A
 * weighted composite would need weights nobody can defend; precedence is at
 * least legible in the rationale line the operator reads.
 */
function comparatorFor(tier: EvidenceTier): (a: ExemplarCandidate, b: ExemplarCandidate) => number {
  if (tier === "outcome") {
    return (a, b) => {
      const x = a.outcome!;
      const y = b.outcome!;
      if (x.jobs !== y.jobs) return y.jobs - x.jobs;
      if (x.wonRevenueCents !== y.wonRevenueCents) return y.wonRevenueCents - x.wonRevenueCents;
      if (x.leads !== y.leads) return y.leads - x.leads;
      if (x.clicks !== y.clicks) return y.clicks - x.clicks;
      return stableTiebreak(a, b);
    };
  }
  if (tier === "engagement") {
    return (a, b) => {
      const x = a.engagement!;
      const y = b.engagement!;
      const xClick = rate(x.clicks, x.sends) ?? 0;
      const yClick = rate(y.clicks, y.sends) ?? 0;
      if (xClick !== yClick) return yClick - xClick;
      const xOpen = rate(x.opens, x.sends) ?? 0;
      const yOpen = rate(y.opens, y.sends) ?? 0;
      if (xOpen !== yOpen) return yOpen - xOpen;
      return stableTiebreak(a, b);
    };
  }
  return (a, b) => {
    const x = a.approval!;
    const y = b.approval!;
    if (x.approvedUnchanged !== y.approvedUnchanged) return x.approvedUnchanged ? -1 : 1;
    if (x.revisionCount !== y.revisionCount) return x.revisionCount - y.revisionCount;
    return stableTiebreak(a, b);
  };
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function rationaleFor(candidate: ExemplarCandidate, tier: EvidenceTier): string {
  if (tier === "outcome") {
    const o = candidate.outcome!;
    const parts = [`${o.jobs} booked job${o.jobs === 1 ? "" : "s"}`, `${o.leads} lead${o.leads === 1 ? "" : "s"}`];
    if (o.wonRevenueCents > 0) parts.push(`${formatMoney(o.wonRevenueCents)} won`);
    return parts.join(" · ");
  }
  if (tier === "engagement") {
    const e = candidate.engagement!;
    return `${formatPercent(rate(e.clicks, e.sends))} click · ${formatPercent(rate(e.opens, e.sends))} open · ${e.sends} sends`;
  }
  const a = candidate.approval!;
  if (a.declined) return "declined by an operator";
  if (a.approvedUnchanged) return "approved with no edits";
  return `approved after ${a.revisionCount} revision${a.revisionCount === 1 ? "" : "s"}`;
}

function truncateBody(body: string): { body: string; truncated: boolean } {
  const trimmed = body.trim();
  if (trimmed.length <= MAX_EXEMPLAR_BODY_CHARS) return { body: trimmed, truncated: false };
  // Cut at a whitespace boundary so the example doesn't end mid-word.
  const slice = trimmed.slice(0, MAX_EXEMPLAR_BODY_CHARS);
  const cut = slice.lastIndexOf(" ");
  return { body: `${(cut > MAX_EXEMPLAR_BODY_CHARS * 0.6 ? slice.slice(0, cut) : slice).trimEnd()}…`, truncated: true };
}

function toSelected(candidate: ExemplarCandidate, tier: EvidenceTier): SelectedExemplar {
  const { body, truncated } = truncateBody(candidate.body);
  return { candidate, rationale: rationaleFor(candidate, tier), body, truncated };
}

/**
 * Pick the strongest tier that clears `minExemplars` on its own. Deliberately not
 * "strongest tier with any data" — one converted asset shouldn't outrank a dozen
 * approval-backed ones and produce a one-example skill labelled `outcome`.
 */
function pickTier(candidates: ExemplarCandidate[], minExemplars: number): EvidenceTier | null {
  for (const tier of EVIDENCE_TIERS) {
    const usable = candidates.filter((c) => hasEvidenceForTier(c, tier) && !isCounterExample(c));
    if (usable.length >= minExemplars) return tier;
  }
  return null;
}

/** How many usable positives the best-populated tier has — for the refusal message. */
function bestAvailableCount(candidates: ExemplarCandidate[]): number {
  let best = 0;
  for (const tier of EVIDENCE_TIERS) {
    const usable = candidates.filter((c) => hasEvidenceForTier(c, tier) && !isCounterExample(c));
    if (usable.length > best) best = usable.length;
  }
  return best;
}

/**
 * Select the exemplars (and counter-examples) that will teach the drafting path
 * this workspace's voice. Returns a refusal rather than a thin skill — see the
 * module header for why that's load-bearing.
 */
export function selectExemplars(input: SelectExemplarsInput): ExemplarSelection {
  const minExemplars = input.minExemplars ?? DEFAULT_MIN_EXEMPLARS;
  const maxExemplars = input.maxExemplars ?? DEFAULT_MAX_EXEMPLARS;
  const budget = input.bodyBudgetChars ?? DEFAULT_BODY_BUDGET_CHARS;

  const scoped = input.candidates.filter(
    (c) =>
      (input.assetType === undefined || c.assetType === input.assetType) &&
      (input.persona === undefined || c.persona === input.persona),
  );

  if (scoped.length === 0) {
    return {
      ok: false,
      reason: "no_candidates",
      detail: "No campaign assets match that asset type and persona yet.",
      usable: 0,
      needed: minExemplars,
    };
  }

  const usable = scoped.filter(hasBody);
  if (usable.length === 0) {
    return {
      ok: false,
      reason: "no_usable_bodies",
      detail: "Those campaign assets have no copy on them yet — nothing to learn from.",
      usable: 0,
      needed: minExemplars,
    };
  }

  const tier = pickTier(usable, minExemplars);
  if (!tier) {
    const available = bestAvailableCount(usable);
    return {
      ok: false,
      reason: "insufficient_evidence",
      detail:
        `Not enough proven copy yet — found ${available} usable example${available === 1 ? "" : "s"}, need ${minExemplars}. ` +
        "Approve or measure more campaign assets and run this again.",
      usable: available,
      needed: minExemplars,
    };
  }

  const compare = comparatorFor(tier);
  const ranked = usable
    .filter((c) => hasEvidenceForTier(c, tier) && !isCounterExample(c))
    .sort(compare);

  const exemplars: SelectedExemplar[] = [];
  let spent = 0;
  let skippedForBudget = 0;
  let skippedAsDuplicate = 0;

  for (const candidate of ranked) {
    if (exemplars.length >= maxExemplars) {
      skippedForBudget += 1;
      continue;
    }
    if (exemplars.some((picked) => similarity(picked.candidate.body, candidate.body) >= DUPLICATE_SIMILARITY)) {
      skippedAsDuplicate += 1;
      continue;
    }
    const selected = toSelected(candidate, tier);
    // The minimum outranks the budget. Every body is already capped by
    // truncateBody, so admitting up to `minExemplars` costs at most
    // minExemplars × MAX_EXEMPLAR_BODY_CHARS — far under the instruction cap the
    // budget exists to protect. Starving the selection below the minimum would
    // only turn a usable skill into a refusal for no safety gain.
    if (exemplars.length >= minExemplars && spent + selected.body.length > budget) {
      skippedForBudget += 1;
      continue;
    }
    exemplars.push(selected);
    spent += selected.body.length;
  }

  if (exemplars.length < minExemplars) {
    // Reachable only via de-duplication: the budget can no longer starve the
    // minimum, and the tier was chosen because it had enough ranked candidates.
    return {
      ok: false,
      reason: "insufficient_evidence",
      detail:
        `Only ${exemplars.length} distinct example${exemplars.length === 1 ? "" : "s"} survived de-duplication, need ${minExemplars}. ` +
        "The matching assets are near-copies of each other.",
      usable: exemplars.length,
      needed: minExemplars,
    };
  }

  const counterExamples = usable
    .filter(isCounterExample)
    .sort((a, b) => {
      const x = a.approval!;
      const y = b.approval!;
      if (x.declined !== y.declined) return x.declined ? -1 : 1;
      if (x.revisionCount !== y.revisionCount) return y.revisionCount - x.revisionCount;
      return stableTiebreak(a, b);
    })
    .slice(0, DEFAULT_MAX_COUNTER_EXAMPLES)
    .map((candidate) => toSelected(candidate, "approval"));

  return { ok: true, tier, exemplars, counterExamples, skippedForBudget, skippedAsDuplicate };
}

const TIER_DISCLOSURE: Record<EvidenceTier, string> = {
  outcome:
    "These examples are ranked by **booked work and won revenue** attributed to them. This is the strongest evidence available.",
  engagement:
    "These examples are ranked by **open and click rates**. No revenue is attributed to them yet, so they show what earns attention, not what closes.",
  approval:
    "These examples are ranked by **what an operator approved without editing**. No send or performance data backs them yet — treat them as this workspace's house style, not as proven performers.",
};

export type RenderExemplarSkillInput = {
  selection: Extract<ExemplarSelection, { ok: true }>;
  /** Workspace display name, for the skill's description. */
  workspaceName: string;
  assetType?: CampaignAssetType;
  persona?: string;
  /** ISO timestamp the caller stamps — kept out of here so the module stays pure. */
  generatedAt: string;
};

export type RenderedExemplarSkill = {
  /** Full SKILL.md, frontmatter included. */
  markdown: string;
  name: string;
  description: string;
  /** Slash command, leading slash included. */
  command: string;
  /** Stable key for upsert — regenerating replaces rather than accumulates. */
  key: string;
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function labelFor(assetType?: CampaignAssetType, persona?: string): string {
  const type = assetType ? assetType.replace(/_/g, " ") : "campaign";
  return persona ? `${type} · ${persona.replace(/_/g, " ")}` : type;
}

/**
 * Render a selection as SKILL.md. The output is read by the drafting path AND by
 * a human auditing why Arc writes the way it does — which is the whole reason
 * this is a legible text artifact rather than an embedding.
 */
export function renderExemplarSkill(input: RenderExemplarSkillInput): RenderedExemplarSkill {
  const { selection, workspaceName, assetType, persona, generatedAt } = input;
  const label = labelFor(assetType, persona);
  const name = `${workspaceName} ${label} voice`.replace(/\s+/g, " ").slice(0, 72);
  const description =
    `Write ${label} copy in ${workspaceName}'s proven voice, learned from ${selection.exemplars.length} of their own ${selection.tier}-backed examples.`.slice(
      0,
      180,
    );
  const command = `/${slug(`write-${assetType ?? "campaign"}-${persona ?? "all"}`)}`;
  const key = `generated-${slug(workspaceName)}-${slug(assetType ?? "campaign")}-${slug(persona ?? "all")}`.slice(0, 100);

  const lines: string[] = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `command: ${command}`,
    `evidence_tier: ${selection.tier}`,
    `generated_at: ${generatedAt}`,
    "---",
    "",
    `# ${name}`,
    "",
    `Generated from ${workspaceName}'s own campaign history on ${generatedAt}. Do not edit by hand — regenerating overwrites this file.`,
    "",
    "## How much to trust this",
    "",
    TIER_DISCLOSURE[selection.tier],
    "",
    `Built from ${selection.exemplars.length} example${selection.exemplars.length === 1 ? "" : "s"}.`,
    "",
    "## How to use it",
    "",
    "Match the *patterns* in these examples — structure, opening move, sentence rhythm, how specific the proof is, how the ask is made. Do not copy their sentences, and do not reuse a claim, number, or customer detail from an example unless the current brief independently supports it.",
    "",
    "Output stays a draft for human approval, exactly like any other draft. This skill changes how copy reads, never whether it goes out.",
    "",
    "## Examples that worked",
    "",
  ];

  selection.exemplars.forEach((exemplar, index) => {
    const c = exemplar.candidate;
    lines.push(`### ${index + 1}. ${c.title}`);
    lines.push("");
    lines.push(`*Why it's here: ${exemplar.rationale}.*`);
    if (c.channel) lines.push(`*Channel: ${c.channel}.*`);
    lines.push("");
    lines.push("```");
    lines.push(exemplar.body);
    lines.push("```");
    if (exemplar.truncated) lines.push("");
    if (exemplar.truncated) lines.push("*(example truncated)*");
    lines.push("");
  });

  if (selection.counterExamples.length > 0) {
    lines.push("## What this workspace rejects");
    lines.push("");
    lines.push("Copy an operator declined or sent back repeatedly. Avoid these moves.");
    lines.push("");
    selection.counterExamples.forEach((counter, index) => {
      lines.push(`### ${index + 1}. ${counter.candidate.title}`);
      lines.push("");
      lines.push(`*Why it's here: ${counter.rationale}.*`);
      lines.push("");
      lines.push("```");
      lines.push(counter.body);
      lines.push("```");
      lines.push("");
    });
  }

  return { markdown: lines.join("\n").trimEnd(), name, description, command, key };
}
