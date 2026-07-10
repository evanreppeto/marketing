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
 * Guardrail (BSR do-not-say): coverage-neutral. Never promise or imply insurance
 * coverage, claim approval, or "we'll get it covered" — restoration + response
 * language only.
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

// Coverage-neutral BSR proof points — restoration capability + responsiveness,
// no coverage/claims language.
const PROOF_POINTS = [
  "24/7 emergency response — crews on-site fast",
  "IICRC-certified restoration technicians",
  "Full photo documentation of every step for your records",
  "Trusted by property owners across Chicagoland",
];

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
  return a || "Re-engage this account with a timely restoration offer";
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
export function buildOpportunityPackageDrafts(brief: OpportunityPackageBrief): PackageAssetDraft[] {
  const angle = cleanAngle(brief.angle);
  const aud = audience(brief.personaLabel);
  const opener = urgencyOpener(brief.urgency, brief.focusLabel);
  const proofTop3 = PROOF_POINTS.slice(0, 3);

  const email: PackageAssetDraft = {
    assetType: "email",
    channel: "Email",
    title: `Email — ${brief.title}`,
    body: [
      `Subject: ${brief.title}`,
      "",
      `Hi there,`,
      "",
      `${opener} ${angle} — that's exactly where Big Shoulders Restoration helps ${aud} like you.`,
      "",
      "Why teams call us first:",
      ...proofTop3.map((p) => `• ${p}`),
      "",
      "Reply to this email or call us and we'll schedule a no-obligation assessment at your convenience.",
      "",
      "— The Big Shoulders Restoration team",
    ].join("\n"),
  };

  const sms: PackageAssetDraft = {
    assetType: "sms",
    channel: "SMS",
    title: `SMS — ${brief.title}`,
    // Kept short for a single segment; coverage-neutral.
    body: `Big Shoulders Restoration: ${angle}. We respond 24/7 with certified crews. Reply YES to book a quick assessment — no obligation.`,
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
      "Big Shoulders Restoration — book a fast, no-obligation assessment.",
    ].join("\n"),
  };

  const landing: PackageAssetDraft = {
    assetType: "landing_page",
    channel: "Landing page",
    title: `Landing page — ${brief.title}`,
    body: [
      `# ${brief.title}`,
      `## ${angle} — with a crew ${aud} trust.`,
      "",
      opener,
      "",
      "What you get:",
      ...PROOF_POINTS.map((p) => `• ${p}`),
      "",
      "[ Book a no-obligation assessment ]",
    ].join("\n"),
  };

  return [email, sms, socialAd, landing];
}
