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
  /** Recommended campaign type, e.g. "referral_outreach" — helps resolve audience kind. */
  campaignType?: string;
};

/**
 * Who the copy is addressed to.
 *
 * The builder used to assume every recipient was a prospective customer, so a
 * referral campaign aimed at a plumbing contractor read "Staying ahead of water
 * backup protects your property and your budget" — pitching a restoration pro as
 * if their own house had flooded. A partner is not a smaller customer; they have
 * a different problem (protecting the customer relationship they earned) and a
 * different ask (a handoff, not an assessment).
 */
export type PackageAudienceKind = "customer" | "partner";

/**
 * Resolve audience kind from the persona and campaign type.
 *
 * Deliberately keyword-based rather than an enum of known personas: personas are
 * per-org and Arc is multi-tenant, so a hardcoded list would silently mis-address
 * every workspace but the one it was written for. "Partner" and "referral" are
 * the words tenants actually use for this relationship.
 */
export function resolveAudienceKind(personaLabel: string, campaignType?: string): PackageAudienceKind {
  const haystack = `${personaLabel ?? ""} ${campaignType ?? ""}`.toLowerCase();
  // Substring, not \b-bounded: campaign types are snake_case and "_" is a word
  // character, so \breferral\b never matches "referral_outreach".
  return /(partner|referral|referrer)/.test(haystack) ? "partner" : "customer";
}

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

/**
 * Humanize defensively. Callers are supposed to pass a label, but one passed the
 * raw key and "helps persona_homeowner_preventative like you" shipped into
 * customer-facing drafts. A key is trivially recognizable, so recover here
 * rather than trusting every call site forever.
 */
function audience(personaLabel: string): string {
  const p = personaLabel.trim();
  if (!p) return "property owners";
  if (/^persona_/.test(p) || (/_/.test(p) && !/\s/.test(p))) {
    return p.replace(/^persona_/, "").replace(/_/g, " ").toLowerCase();
  }
  return p.toLowerCase();
}

/**
 * Clauses an opportunity's `recommended_action` carries because it is an
 * instruction to *us*, not a message to a customer. They were being printed
 * verbatim into email, SMS, ads, and landing copy — including, memorably,
 * "no outbound until approved" sent to the recipient.
 */
const INTERNAL_CLAUSE = /(;|,)?\s*(and\s+)?(no\s+(outbound|send|record\s+edits?|ad\s+spend)[^.;]*|for\s+human\s+approval|until\s+approved|pending\s+approval)[^.;]*/gi;

/**
 * Verbs that mark an angle as a work order aimed at the agent or operator
 * ("Queue a package…", "Assemble a prospect list…"). Copy built from one reads
 * as internal chatter leaking to the customer, so we drop it entirely rather
 * than trying to rewrite it deterministically.
 */
const WORK_ORDER = /^\s*(queue|prepare|assemble|build|draft|review|activate|identify|create|compile|flag|verify|recommend)\b/i;

/**
 * Vocabulary that only exists inside the tool. "Re-engage with a persona-tailored
 * campaign" is not a work order and cleared the verb check, yet it still tells the
 * recipient about our personas and campaigns. Customers do not know these words.
 */
const INTERNAL_VOCAB = /\b(campaign|package|persona|prospect list|outreach|handoff process|back-?fill|rollup|attribution|segment|lookalike|CRM|inbox|draft)\b/i;

/**
 * A customer-safe angle, or "" when the recommended action is an internal work
 * order. Returning "" is deliberate: a generic-but-clean line beats a specific
 * line that tells the recipient about our approval workflow.
 */
export function customerSafeAngle(angle: string): string {
  const stripped = (angle || "").replace(INTERNAL_CLAUSE, "").replace(/\s+/g, " ").trim().replace(/[.,;!]+$/, "");
  if (!stripped) return "";
  if (WORK_ORDER.test(stripped)) return "";
  if (INTERNAL_VOCAB.test(stripped)) return "";
  return stripped;
}

function focusPhrase(focusLabel: string): string {
  const f = focusLabel.trim().toLowerCase();
  return f ? f : "property damage";
}

/** A clean, sentence-cased angle without a trailing period (we add our own). */
function cleanAngle(angle: string): string {
  const a = angle.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  // Addressed to the reader. The old default ("Re-engage this account…") was
  // written from our side of the table.
  return a || "We're here when you need fast, professional help";
}

function urgencyOpener(urgency: OpportunityPackageBrief["urgency"], focusLabel: string): string {
  const focus = focusPhrase(focusLabel);
  if (urgency === "high") return `When ${focus} hits, every hour counts.`;
  if (urgency === "medium") return `Staying ahead of ${focus} protects your property and your budget.`;
  return `A quick check-in about ${focus} at your property.`;
}

/**
 * Partner copy. The offer is a referral handoff: we take the work they do not
 * want, and hand the customer back. No "your property", no "your budget" — the
 * damage is their customer's, not theirs.
 */
function partnerDrafts(
  brief: OpportunityPackageBrief,
  name: string,
  proofTop3: string[],
  proofPoints: string[],
): PackageAssetDraft[] {
  const focus = focusPhrase(brief.focusLabel);
  const us = name || "we";
  const usCap = name || "We";
  const subject = `A referral handoff for your ${focus} calls`;
  const headline = `Partner with ${name || "us"} on ${focus} jobs`;

  return [
    {
      assetType: "email",
      channel: "Email",
      title: `Email — ${brief.title}`,
      body: [
        `Subject: ${subject}`,
        "",
        "Hi there,",
        "",
        `When your team stops the source of a ${focus} problem, the customer still needs mitigation, documentation, and rebuild coordination — and that is where the relationship you earned is easiest to lose.`,
        "",
        // A company name is singular ("Acme handles"), the pronoun is not ("We handle").
        `${usCap} handle${name ? "s" : ""} that side and hand${name ? "s" : ""} the customer back to you.`,
        "",
        "Why partners work with us:",
        ...proofTop3.map((p) => `• ${p}`),
        "",
        `Would a simple referral handoff be useful for your ${focus} calls? Reply and we'll set one up — no contract, no exclusivity.`,
        "",
        name ? `— The ${name} team` : "— The team",
      ].join("\n"),
    },
    {
      assetType: "sms",
      channel: "SMS",
      title: `SMS — ${brief.title}`,
      body: `${name ? `${name}: ` : ""}partnering on ${focus} jobs — we handle mitigation and documentation, you keep the customer. ${proofTop3[0]}. Reply INFO for a simple handoff.`,
    },
    {
      assetType: "social_ad",
      channel: "Paid social",
      title: `Paid social — ${brief.title}`,
      body: [
        headline,
        "",
        `You stop the source. ${us === "we" ? "We" : us} handle${us === "we" ? "" : "s"} mitigation, documentation, and rebuild — and the customer stays yours. ${proofTop3[0]}.`,
        "",
        "Set up a referral handoff — no contract, no exclusivity.",
      ].join("\n"),
    },
    {
      assetType: "landing_page",
      channel: "Landing page",
      title: `Landing page — ${brief.title}`,
      body: [
        `# ${headline}`,
        `## You stop the source. We handle what comes next.`,
        "",
        `Your customer still needs mitigation, documentation, and rebuild coordination after a ${focus} call. We do that work and hand the relationship back to you.`,
        "",
        "What partners get:",
        ...proofPoints.map((p) => `• ${p}`),
        "",
        "[ Set up a referral handoff ]",
      ].join("\n"),
    },
  ];
}

/**
 * A subject line written for the recipient. The opportunity title is an internal
 * headline — "Dana Whitfield (Southside Water & Gas) — quiet 53 days" tells an
 * operator why the card surfaced and tells a customer that we have been counting
 * the days since they last replied.
 */
/** Customer-facing headline for ads and landing pages — never the internal title. */
function headline(brief: OpportunityPackageBrief, businessName: string): string {
  const focus = brief.focusLabel.trim();
  if (focus) return `${focus} help, when you need it`;
  return businessName ? `${businessName} — here when you need us` : "Here when you need us";
}

function emailSubject(brief: OpportunityPackageBrief, businessName: string): string {
  const focus = brief.focusLabel.trim();
  if (focus) return `A quick note about ${focus.toLowerCase()} at your property`;
  const aud = audience(brief.personaLabel);
  return businessName ? `A quick note from ${businessName}` : `A quick note for ${aud}`;
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
  // The opportunity's recommended action is an instruction to Arc; only use it
  // as copy when it survives the internal-work-order filter.
  const safeAngle = customerSafeAngle(brief.angle);
  const angle = safeAngle || cleanAngle("");
  const opener = urgencyOpener(brief.urgency, brief.focusLabel);
  // "the business" is getBusinessContext's own empty-name fallback — treat it as
  // absent so the copy degrades to a pronoun rather than printing a placeholder.
  const rawName = context.businessName?.trim();
  const name = rawName && rawName.toLowerCase() !== "the business" ? rawName : "";
  const proofSource = (context.proofPoints ?? []).map((p) => p.trim()).filter(Boolean);
  const proofPoints = proofSource.length ? proofSource : NEUTRAL_PROOF_POINTS;
  const proofTop3 = proofPoints.slice(0, 3);

  if (resolveAudienceKind(brief.personaLabel, brief.campaignType) === "partner") {
    return partnerDrafts(brief, name, proofTop3, proofPoints);
  }

  const email: PackageAssetDraft = {
    assetType: "email",
    channel: "Email",
    title: `Email — ${brief.title}`,
    body: [
      // NOT the opportunity title: that is an internal inbox headline
      // ("… — quiet 53 days") and reads as surveillance in a subject line.
      `Subject: ${emailSubject(brief, name)}`,
      "",
      `Hi there,`,
      "",
      // Only tack on the "that's where we help" clause when there is a real
      // angle to attach it to; with the fallback it reads "help … can help".
      safeAngle
        ? `${opener} ${angle} — that's exactly where ${name ? name : "we"} can help.`
        : `${opener} ${name ? `${name} is` : "We're"} here when you need fast, professional help.`,
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
      `${headline(brief, name)}`,
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
      `# ${headline(brief, name)}`,
      `## ${angle}`,
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
