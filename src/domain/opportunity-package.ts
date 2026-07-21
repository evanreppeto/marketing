/**
 * Deterministic, LLM-free draft copy for an opportunity-sourced campaign package.
 *
 * When an operator asks Arc to draft from an opportunity, the run generates a
 * starter package — email, SMS, paid-social, and landing copy — that lands as
 * approval-gated `campaign_assets`. This module produces that copy purely from
 * the opportunity brief so the flow is testable without a live model (real-model
 * copy quality is a later ticket). Nothing here sends; the copy is a draft the
 * operator reviews and approves.
 *
 * Guardrail: coverage-neutral. Never promise or imply insurance coverage, claim
 * approval, or "we'll get it covered." (Originated as a BSR do-not-say rule; it's a
 * safe default for any workspace.)
 *
 * Tenant-neutral: the business name + proof points are supplied by the caller from
 * the workspace's own brand context — nothing here names a company or a vertical.
 */

/** campaign_assets.asset_type values this package uses (subset of the enum). */
export type PackageAssetType = "email" | "sms" | "social_ad" | "landing_page";

export type OpportunityPackageBrief = {
  /** Opportunity/campaign title — headlines and subjects. */
  title: string;
  /** The message angle (the opportunity's recommended action). */
  angle: string;
  /** Humanized persona label (e.g. "Property manager"), or "". */
  personaLabel: string;
  /** Humanized restoration focus (e.g. "Water backup"), or "". */
  focusLabel: string;
  /** Drives tone/urgency of the copy. */
  urgency: "low" | "medium" | "high";
  /** Optional subject label (e.g. "Lead", "Company") for light personalization. */
  subjectLabel?: string;
};

export type PackageAssetDraft = {
  assetType: PackageAssetType;
  /** Human channel label for the deliverable title. */
  channel: string;
  title: string;
  body: string;
};

// Industry-agnostic fallback proof points, used when the workspace hasn't set its
// own in the Brand Kit. Deliberately generic — no vertical, no geography, no claims.
const NEUTRAL_PROOF_POINTS = [
  "Fast, responsive service when it matters",
  "An experienced, professional team",
  "Clear communication and documentation at every step",
];

export type OpportunityPackageContext = {
  /** The workspace's business name, woven into the copy. Absent → the copy uses a
   *  pronoun ("we") rather than naming anyone. */
  businessName?: string;
  /** The workspace's own brand proof points; falls back to NEUTRAL_PROOF_POINTS. */
  proofPoints?: string[];
};

function audience(personaLabel: string): string {
  const p = personaLabel.trim();
  return p ? p.toLowerCase() : "property owners";
}

function focusPhrase(focusLabel: string): string {
  const f = focusLabel.trim().toLowerCase();
  return f ? f : "property damage";
}

/** A clean, sentence-cased angle without a trailing period (we add our own). */
function cleanAngle(angle: string): string {
  const a = angle.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  return a || "Re-engage this account with a timely, relevant offer";
}

function urgencyOpener(urgency: OpportunityPackageBrief["urgency"], focusLabel: string): string {
  const focus = focusPhrase(focusLabel);
  if (urgency === "high") return `When ${focus} hits, every hour counts.`;
  if (urgency === "medium") return `Staying ahead of ${focus} protects your property and your budget.`;
  return `A quick check-in about ${focus} at your property.`;
}

/**
 * Build the 4-piece draft package from an opportunity brief. Deterministic:
 * the same brief always yields the same copy. Each piece is a draft the operator
 * reviews — nothing outbound.
 */
export function buildOpportunityPackageDrafts(
  brief: OpportunityPackageBrief,
  context: OpportunityPackageContext = {},
): PackageAssetDraft[] {
  const angle = cleanAngle(brief.angle);
  const aud = audience(brief.personaLabel);
  const opener = urgencyOpener(brief.urgency, brief.focusLabel);
  // "the business" is getBusinessContext's own empty-name fallback — treat it as
  // absent so the copy degrades to a pronoun rather than printing a placeholder.
  const rawName = context.businessName?.trim();
  const name = rawName && rawName.toLowerCase() !== "the business" ? rawName : "";
  const proofSource = (context.proofPoints ?? []).map((p) => p.trim()).filter(Boolean);
  const proofPoints = proofSource.length ? proofSource : NEUTRAL_PROOF_POINTS;
  const proofTop3 = proofPoints.slice(0, 3);

  const email: PackageAssetDraft = {
    assetType: "email",
    channel: "Email",
    title: `Email — ${brief.title}`,
    body: [
      `Subject: ${brief.title}`,
      "",
      `Hi there,`,
      "",
      `${opener} ${angle} — that's exactly where ${name ? `${name} helps` : "we help"} ${aud} like you.`,
      "",
      "Why teams call us first:",
      ...proofTop3.map((p) => `• ${p}`),
      "",
      "Reply to this email or call us and we'll schedule a no-obligation assessment at your convenience.",
      "",
      name ? `— The ${name} team` : "— The team",
    ].join("\n"),
  };

  const sms: PackageAssetDraft = {
    assetType: "sms",
    channel: "SMS",
    title: `SMS — ${brief.title}`,
    // Kept short for a single segment; coverage-neutral.
    body: `${name ? `${name}: ` : ""}${angle}. ${proofTop3[0]}. Reply YES to book a quick assessment — no obligation.`,
  };

  const socialAd: PackageAssetDraft = {
    assetType: "social_ad",
    channel: "Paid social",
    title: `Paid social — ${brief.title}`,
    body: [
      `${brief.title}`,
      "",
      `${angle}. ${proofTop3[0]}.`,
      "",
      name ? `${name} — book a fast, no-obligation assessment.` : "Book a fast, no-obligation assessment.",
    ].join("\n"),
  };

  const landing: PackageAssetDraft = {
    assetType: "landing_page",
    channel: "Landing page",
    title: `Landing page — ${brief.title}`,
    body: [
      `# ${brief.title}`,
      `## ${angle} — with a team ${aud} trust.`,
      "",
      opener,
      "",
      "What you get:",
      ...proofPoints.map((p) => `• ${p}`),
      "",
      "[ Book a no-obligation assessment ]",
    ].join("\n"),
  };

  return [email, sms, socialAd, landing];
}
