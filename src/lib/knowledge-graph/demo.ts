/**
 * Demo Marketing Brain — a believable BSR knowledge graph used as a graceful
 * fallback when Supabase is not configured (local preview, no DB) or returns an
 * empty brain. Nothing here is sendable; it is read-only display data so the
 * Brain page reads like a populated knowledge memory instead of an empty shell.
 *
 * The shapes match the persisted read-model exactly (`BrainNode` / `BrainEdge`),
 * so the same graph, browser, KPI row, and approval-queue components render it
 * with no special-casing. Proposed nodes stay visibly separate (awaiting review)
 * to preserve the approval-gate semantics.
 */
import { type BrainEdge, type BrainNode } from "./read-model";

type DemoNodeSeed = {
  id: string;
  kind: string;
  label: string;
  body: string;
  summary?: string;
  persona?: string;
  trustTier: BrainNode["trustTier"];
  confidence?: number;
  source?: string;
  tags?: string[];
  refTable?: string;
  refId?: string;
  createdBy?: string;
  /** Days ago this was learned, used to render the "recently learned" timeline. */
  daysAgo?: number;
};

const ISO = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

// ---------------------------------------------------------------------------
// Node seeds — central Arc hub, brand facts, the 12 personas, proof points,
// campaigns, customer objections, channels, services, learnings, signals.
// ---------------------------------------------------------------------------
const SEEDS: DemoNodeSeed[] = [
  // -- Central hub ----------------------------------------------------------
  {
    id: "arc",
    kind: "other",
    label: "Arc",
    body: "Meridian's marketing operator. Everything the brain knows radiates from here.",
    trustTier: "trusted",
    source: "system",
    tags: ["core"],
    createdBy: "system",
    daysAgo: 120,
  },

  // -- Brand facts ----------------------------------------------------------
  {
    id: "bf_24_7",
    kind: "brand_fact",
    label: "24/7 customer support",
    body: "Meridian offers 24/7 customer support and responds to urgent tickets within the hour worldwide.",
    summary: "Always-on support. Urgent tickets answered within the hour.",
    trustTier: "trusted",
    confidence: 98,
    source: "Ops handbook",
    tags: ["emergency", "speed"],
    createdBy: "operator",
    daysAgo: 64,
  },
  {
    id: "bf_iicrc",
    kind: "brand_fact",
    label: "SOC 2 Type II certified",
    body: "Meridian maintains SOC 2 Type II certification across security, availability, and confidentiality. Audits are renewed annually.",
    summary: "SOC 2 Type II certified and audited annually.",
    trustTier: "trusted",
    confidence: 97,
    source: "Certification registry",
    tags: ["certification", "trust"],
    createdBy: "operator",
    daysAgo: 58,
  },
  {
    id: "bf_local",
    kind: "brand_fact",
    label: "Independently operated since 2011",
    body: "Independently owned and operated since 2011. The team knows mid-market workflows, integrations, and seasonal usage patterns.",
    summary: "A seasoned team that knows mid-market workflows.",
    trustTier: "trusted",
    confidence: 95,
    source: "Company profile",
    tags: ["local"],
    createdBy: "operator",
    daysAgo: 70,
  },
  {
    id: "bf_insurance",
    kind: "brand_fact",
    label: "Flexible procurement & billing",
    body: "We handle security review and procurement paperwork directly, then bill annually so teams are not out of pocket up front.",
    summary: "We handle procurement paperwork and bill annually.",
    trustTier: "trusted",
    confidence: 92,
    source: "Procurement playbook",
    tags: ["insurance"],
    createdBy: "operator",
    daysAgo: 41,
  },

  // -- Services -------------------------------------------------------------
  {
    id: "svc_water",
    kind: "service",
    label: "Onboarding & migration",
    body: "Guided data migration, workspace setup, and adoption monitoring during onboarding.",
    trustTier: "trusted",
    confidence: 96,
    source: "Service catalog",
    tags: ["water"],
    createdBy: "operator",
    daysAgo: 80,
  },
  {
    id: "svc_fire",
    kind: "service",
    label: "Incident recovery",
    body: "Root-cause cleanup, data reconciliation, and workflow recovery after an outage or incident.",
    trustTier: "trusted",
    confidence: 94,
    source: "Service catalog",
    tags: ["fire"],
    createdBy: "operator",
    daysAgo: 80,
  },
  {
    id: "svc_mold",
    kind: "service",
    label: "Data hygiene & cleanup",
    body: "Duplicate containment, field normalization, and cleanup with post-cleanup verification.",
    trustTier: "trusted",
    confidence: 93,
    source: "Service catalog",
    tags: ["mold"],
    createdBy: "operator",
    daysAgo: 80,
  },

  // -- Personas (12) --------------------------------------------------------
  persona("persona_homeowner_emergency", "Active-Trial Evaluator", "An evaluator mid-trial with an urgent blocker who needs hands-on help right now.", ["homeowner", "emergency"], 91, 18),
  persona("persona_homeowner_preventative", "Nurture Evaluator", "An evaluator booking a walkthrough to vet the product before committing.", ["homeowner"], 78, 33),
  persona("persona_homeowner_rebuild", "Win-Back Evaluator", "A lapsed account now re-evaluating and navigating renewal and procurement.", ["homeowner", "insurance"], 84, 27),
  persona("persona_landlord", "Multi-Seat Owner", "An owner of one or more team workspaces who needs fast rollouts to limit idle seats.", ["property"], 80, 22),
  persona("persona_hoa_board", "Buying Committee Member", "A committee member responsible for shared tooling and shared-budget decisions.", ["property"], 72, 45),
  persona("persona_property_manager", "Team Admin", "Manages a portfolio of teams and needs one reliable software vendor on call.", ["property"], 82, 20),
  persona("persona_insurance_agent", "Referral Advisor", "An advisor who refers a trusted vendor to keep rollouts clean and clients calm.", ["insurance", "referral"], 86, 15),
  persona("persona_listing_agent", "Renewal Manager", "A renewal manager who needs blockers cleared fast so an account stays on-track.", ["real-estate"], 74, 38),
  persona("persona_buyers_agent", "Procurement Lead", "A procurement lead flagging review findings that need resolving before close.", ["real-estate"], 70, 50),
  persona("persona_plumbing_partner", "Integration Partner", "An integration partner who hits an adjacent need on a project and hands off the workflow.", ["partner"], 81, 24),
  persona("persona_hvac_roof_electrical_partner", "Reseller Partner", "A reseller partner whose accounts overlap with Meridian's workflow needs.", ["partner"], 76, 36),
  persona("persona_gc_remodeler_partner", "Solutions Partner", "A solutions integrator who subs out workflow setup to keep projects moving.", ["partner"], 79, 30),

  // -- Proof points ---------------------------------------------------------
  {
    id: "pp_homes",
    kind: "proof_point",
    label: "4,200+ teams onboarded",
    body: "Over 4,200 teams onboarded since 2011 — the headline credibility stat for cold outreach.",
    summary: "4,200+ teams onboarded since 2011.",
    trustTier: "trusted",
    confidence: 90,
    source: "Internal account ledger",
    tags: ["stat", "credibility"],
    createdBy: "operator",
    daysAgo: 12,
  },
  {
    id: "pp_response",
    kind: "proof_point",
    label: "47-minute median support response",
    body: "Median first response on urgent support tickets over the last 12 months was 47 minutes.",
    summary: "47-minute median urgent response.",
    trustTier: "trusted",
    confidence: 88,
    source: "Support logs",
    tags: ["stat", "speed"],
    createdBy: "operator",
    daysAgo: 9,
  },
  {
    id: "pp_rating",
    kind: "proof_point",
    label: "4.9★ across 600+ reviews",
    body: "Aggregate 4.9-star rating across G2 and Capterra from more than 600 verified reviews.",
    summary: "4.9 stars, 600+ reviews.",
    trustTier: "trusted",
    confidence: 89,
    source: "Review aggregator",
    tags: ["stat", "social-proof"],
    createdBy: "operator",
    daysAgo: 6,
  },
  {
    id: "pp_testimonial",
    kind: "proof_point",
    label: "Testimonial — mid-market ops team",
    body: '"The team had us set up in under an hour and walked us through procurement step by step." — verified customer, mid-market ops.',
    summary: "Mid-market ops team testimonial.",
    trustTier: "trusted",
    confidence: 85,
    source: "Reviews",
    tags: ["testimonial"],
    createdBy: "operator",
    daysAgo: 14,
  },

  // -- Campaigns ------------------------------------------------------------
  {
    id: "camp_ewr",
    kind: "campaign_ref",
    label: "Pricing-Intent Fast Track Program",
    body: "Always-on campaign package for the Active-Trial Evaluator — fast-response promise, procurement reassurance, and before/after proof.",
    summary: "Always-on pricing-intent campaign for evaluators.",
    trustTier: "trusted",
    confidence: 87,
    source: "Campaigns",
    tags: ["water", "emergency"],
    refTable: "campaigns",
    refId: "demo-emergency-water-response-2026",
    createdBy: "arc",
    daysAgo: 3,
  },
  {
    id: "camp_storm",
    kind: "campaign_ref",
    label: "Quarterly Nurture Refresh",
    body: "Seasonal nurture push to evaluators and team admins ahead of the quarterly planning cycle.",
    summary: "Seasonal nurture campaign.",
    trustTier: "observed",
    confidence: 68,
    source: "Campaigns",
    tags: ["seasonal"],
    createdBy: "arc",
    daysAgo: 5,
  },
  {
    id: "camp_partner",
    kind: "campaign_ref",
    label: "Channel Partner Referral Loop",
    body: "Partner-nurture sequence that keeps Meridian top-of-mind for integration, reseller, and solutions partners who hand off workflows.",
    summary: "Referral nurture for channel partners.",
    trustTier: "observed",
    confidence: 64,
    source: "Campaigns",
    tags: ["partner", "referral"],
    createdBy: "arc",
    daysAgo: 8,
  },

  // -- Source-system coverage nodes -----------------------------------------
  // One node per missing source so the filter bar and provenance UI exercise
  // every system in local/demo mode. Rules from nodeProvenance:
  //   brand   → refTable:"media_assets" + tag "brand-source"
  //   library → refTable:"media_assets" WITHOUT "brand-source" (and a refId)
  //   crm     → refTable in CRM_TABLES + refId
  {
    id: "demo_brand_asset",
    kind: "brand_fact",
    label: "Before/after hero image — dashboard",
    body: "Approved brand image showing a cluttered workspace before Meridian and a streamlined dashboard after. Primary creative for Active-Trial Evaluator campaigns.",
    summary: "Approved before/after hero image for pricing-intent campaigns.",
    trustTier: "trusted",
    confidence: 94,
    source: "Brand media library",
    tags: ["brand-source", "before-after", "water"],
    refTable: "media_assets",
    refId: "demo-brand-hero-water-2026",
    createdBy: "operator",
    daysAgo: 35,
  },
  {
    id: "demo_library_asset",
    kind: "proof_point",
    label: "Onboarding walkthrough screenshot",
    body: "Product screenshot of a guided onboarding walkthrough in Meridian. Available for use in paid social and landing pages.",
    summary: "Onboarding walkthrough screenshot for adoption campaigns.",
    trustTier: "trusted",
    confidence: 88,
    source: "Media library",
    tags: ["mold", "crew", "social-proof"],
    refTable: "media_assets",
    refId: "demo-library-crew-mold-2026",
    createdBy: "operator",
    daysAgo: 28,
  },
  {
    id: "demo_crm_contact",
    kind: "proof_point",
    label: "Referral contact — integration partner",
    body: "Verified integration partner who referred three accounts in Q1. High-value referral source in the Channel Partner persona segment.",
    summary: "Top-referring integration partner in CRM.",
    trustTier: "trusted",
    confidence: 86,
    source: "CRM",
    tags: ["partner", "referral"],
    refTable: "contacts",
    refId: "demo-contact-plumber-lincoln-park",
    createdBy: "operator",
    daysAgo: 17,
  },

  // -- Customer objections --------------------------------------------------
  {
    id: "obj_insurance",
    kind: "messaging_angle",
    label: 'Objection: "Isn\'t our current tool fine?"',
    body: "Evaluators hesitate, assuming their current tool covers everything. Reframe: we handle migration and procurement directly, so switching protects momentum rather than complicating it.",
    summary: "Reframe switching worry as momentum protection.",
    trustTier: "trusted",
    confidence: 83,
    source: "Sales call review",
    tags: ["objection", "insurance"],
    createdBy: "operator",
    daysAgo: 19,
  },
  {
    id: "obj_diy",
    kind: "messaging_angle",
    label: 'Objection: "We can build this in-house"',
    body: "In-house builds miss the maintenance and edge cases that surface weeks later. Lead with the hidden-cost risk and our proven, supported workflows.",
    summary: "Counter DIY with hidden-cost / maintenance risk.",
    trustTier: "trusted",
    confidence: 80,
    source: "Sales call review",
    tags: ["objection"],
    createdBy: "operator",
    daysAgo: 16,
  },
  {
    id: "obj_price",
    kind: "messaging_angle",
    label: 'Objection: "How much will this cost?"',
    body: "Price anxiety stalls trials. Lead with flexible procurement and a free walkthrough so cost is not the first hurdle.",
    summary: "Defuse cost anxiety with flexible procurement + free walkthrough.",
    trustTier: "observed",
    confidence: 71,
    source: "Sales call review",
    tags: ["objection", "price"],
    createdBy: "arc",
    daysAgo: 11,
  },

  // -- Channels -------------------------------------------------------------
  {
    id: "ch_email",
    kind: "cta",
    label: "Email — book-a-demo CTA",
    body: 'Primary email call to action: "Book a walkthrough" with one-click scheduling. Best performer for the Active-Trial Evaluator persona.',
    summary: "One-click demo CTA for email.",
    trustTier: "trusted",
    confidence: 82,
    source: "Channel performance",
    tags: ["email", "channel"],
    createdBy: "operator",
    daysAgo: 21,
  },
  {
    id: "ch_sms",
    kind: "cta",
    label: "SMS — quick reply nudge",
    body: "SMS works for re-engagement and demo confirmations. Keep under 160 chars, lead with the walkthrough offer.",
    summary: "SMS for demos + re-engagement.",
    trustTier: "observed",
    confidence: 66,
    source: "Channel performance",
    tags: ["sms", "channel"],
    createdBy: "arc",
    daysAgo: 13,
  },
  {
    id: "ch_paid",
    kind: "cta",
    label: "Paid social — before/after proof",
    body: "Before/after creative drives the strongest paid-social engagement. Pair with the 4,200-teams proof point.",
    summary: "Before/after creative for paid social.",
    trustTier: "observed",
    confidence: 69,
    source: "Channel performance",
    tags: ["paid", "channel"],
    createdBy: "arc",
    daysAgo: 7,
  },

  // -- Learnings ------------------------------------------------------------
  {
    id: "learn_speed",
    kind: "learning",
    label: "Speed beats price in urgent copy",
    body: "Across urgent campaigns, leading with response speed outperformed leading with price or certifications by a wide margin on reply rate.",
    summary: "Lead urgent copy with speed, not price.",
    trustTier: "trusted",
    confidence: 81,
    source: "Performance loop",
    tags: ["learning", "emergency"],
    createdBy: "arc",
    daysAgo: 4,
  },
  {
    id: "learn_proof",
    kind: "learning",
    label: "Before/after proof lifts paid CTR",
    body: "Swapping stock imagery for real before/after product screenshots lifted paid-social click-through meaningfully.",
    summary: "Real before/after screenshots beat stock.",
    trustTier: "trusted",
    confidence: 77,
    source: "Performance loop",
    tags: ["learning", "creative"],
    createdBy: "arc",
    daysAgo: 2,
  },

  // -- Signals --------------------------------------------------------------
  {
    id: "sig_weather",
    kind: "signal",
    label: "Pricing-page surge rising",
    body: "Analytics show a pricing-page visit surge across high-intent accounts this week — a leading indicator of trial-signup volume.",
    summary: "Pricing-page surge → trial-signup demand.",
    trustTier: "observed",
    confidence: 62,
    source: "Engagement feed",
    tags: ["weather", "signal"],
    createdBy: "arc",
    daysAgo: 1,
  },

  // -- Proposed (awaiting review) -------------------------------------------
  {
    id: "prop_response_2hr",
    kind: "proof_point",
    label: "Sub-2-hour response guarantee",
    body: "Arc observed marketing language promising a sub-2-hour response. Needs operator confirmation before it can govern outbound copy.",
    summary: "Possible sub-2-hour response promise — unverified.",
    trustTier: "proposed",
    confidence: 54,
    source: "Arc — competitor scan",
    tags: ["proposed", "speed"],
    createdBy: "arc",
    daysAgo: 1,
  },
  {
    id: "prop_warranty",
    kind: "brand_fact",
    label: "99.9% uptime SLA",
    body: "Arc drafted a 99.9% uptime SLA claim from a sales deck. Awaiting operator approval before use in campaigns.",
    summary: "Drafted 99.9% uptime SLA claim — awaiting approval.",
    trustTier: "proposed",
    confidence: 48,
    source: "Arc — sales deck",
    tags: ["proposed", "warranty"],
    createdBy: "arc",
    daysAgo: 2,
  },
  {
    id: "prop_commercial",
    kind: "segment",
    label: "Enterprise segment",
    body: "Arc noticed a cluster of enterprise and multi-team leads that may warrant their own segment and messaging track.",
    summary: "Possible enterprise/multi-team segment.",
    trustTier: "proposed",
    confidence: 51,
    source: "Arc — CRM scan",
    tags: ["proposed", "segment"],
    createdBy: "arc",
    daysAgo: 3,
  },
];

function persona(
  id: string,
  label: string,
  body: string,
  tags: string[],
  confidence: number,
  daysAgo: number,
): DemoNodeSeed {
  return {
    id,
    kind: "persona",
    label,
    body,
    persona: id,
    trustTier: "trusted",
    confidence,
    source: "Persona library",
    tags,
    createdBy: "operator",
    daysAgo,
  };
}

// ---------------------------------------------------------------------------
// Edges — [from, relation, to]. Brand facts/proof govern personas & campaigns;
// services target personas; learnings feed campaigns; everything anchors to Arc.
// ---------------------------------------------------------------------------
const EDGE_SEEDS: Array<[string, string, string]> = [
  // Hub spokes — anchor the major clusters to Arc so the web radiates outward.
  ["arc", "relates_to", "bf_24_7"],
  ["arc", "relates_to", "bf_iicrc"],
  ["arc", "relates_to", "bf_local"],
  ["arc", "relates_to", "bf_insurance"],
  ["arc", "relates_to", "camp_ewr"],
  ["arc", "relates_to", "camp_storm"],
  ["arc", "relates_to", "camp_partner"],
  ["arc", "relates_to", "pp_homes"],
  ["arc", "relates_to", "svc_water"],
  ["arc", "relates_to", "persona_homeowner_emergency"],
  ["arc", "relates_to", "persona_insurance_agent"],
  ["arc", "relates_to", "persona_property_manager"],
  ["arc", "relates_to", "persona_plumbing_partner"],
  ["arc", "relates_to", "sig_weather"],

  // Brand facts govern personas.
  ["bf_24_7", "governs", "persona_homeowner_emergency"],
  ["bf_24_7", "governs", "persona_landlord"],
  ["bf_iicrc", "governs", "persona_homeowner_rebuild"],
  ["bf_iicrc", "governs", "persona_insurance_agent"],
  ["bf_local", "governs", "persona_property_manager"],
  ["bf_local", "governs", "persona_hoa_board"],
  ["bf_insurance", "governs", "persona_insurance_agent"],
  ["bf_insurance", "governs", "persona_homeowner_rebuild"],

  // Services target personas.
  ["svc_water", "targets", "persona_homeowner_emergency"],
  ["svc_water", "targets", "persona_landlord"],
  ["svc_mold", "targets", "persona_homeowner_preventative"],
  ["svc_fire", "targets", "persona_homeowner_rebuild"],

  // Proof points prove brand facts / power campaigns.
  ["pp_response", "proves", "bf_24_7"],
  ["pp_homes", "proves", "bf_local"],
  ["pp_rating", "proves", "bf_iicrc"],
  ["pp_testimonial", "proves", "bf_24_7"],
  ["pp_homes", "used_in", "camp_ewr"],
  ["pp_response", "used_in", "camp_ewr"],

  // Campaigns target personas.
  ["camp_ewr", "targets", "persona_homeowner_emergency"],
  ["camp_ewr", "responds_to", "obj_insurance"],
  ["camp_storm", "targets", "persona_homeowner_preventative"],
  ["camp_storm", "targets", "persona_property_manager"],
  ["camp_partner", "targets", "persona_plumbing_partner"],
  ["camp_partner", "targets", "persona_gc_remodeler_partner"],

  // Objections respond to personas; channels carry CTAs.
  ["obj_insurance", "responds_to", "persona_homeowner_emergency"],
  ["obj_diy", "responds_to", "persona_homeowner_preventative"],
  ["obj_price", "responds_to", "persona_homeowner_emergency"],
  ["ch_email", "used_in", "camp_ewr"],
  ["ch_sms", "used_in", "camp_ewr"],
  ["ch_paid", "used_in", "camp_storm"],
  ["ch_paid", "proves", "pp_rating"],

  // Learnings & signals.
  ["camp_ewr", "learned_from", "learn_speed"],
  ["ch_paid", "learned_from", "learn_proof"],
  ["learn_proof", "proves", "pp_homes"],
  ["sig_weather", "relates_to", "persona_homeowner_emergency"],
  ["sig_weather", "relates_to", "svc_water"],

  // Persona clusters (segment cohesion).
  ["persona_homeowner_emergency", "relates_to", "persona_homeowner_preventative"],
  ["persona_homeowner_preventative", "relates_to", "persona_homeowner_rebuild"],
  ["persona_plumbing_partner", "relates_to", "persona_hvac_roof_electrical_partner"],
  ["persona_hvac_roof_electrical_partner", "relates_to", "persona_gc_remodeler_partner"],
  ["persona_listing_agent", "relates_to", "persona_buyers_agent"],
  ["persona_insurance_agent", "relates_to", "persona_listing_agent"],
  ["persona_landlord", "relates_to", "persona_property_manager"],
  ["persona_property_manager", "relates_to", "persona_hoa_board"],

  // Source-system coverage edges.
  ["demo_brand_asset", "used_in", "camp_ewr"],
  ["demo_library_asset", "governs", "svc_mold"],
  ["demo_crm_contact", "targets", "persona_plumbing_partner"],

  // Proposed nodes link to where they would attach once trusted.
  ["prop_response_2hr", "proves", "bf_24_7"],
  ["prop_warranty", "governs", "persona_homeowner_rebuild"],
  ["prop_commercial", "relates_to", "persona_property_manager"],
];

function toNode(seed: DemoNodeSeed): BrainNode {
  return {
    id: seed.id,
    kind: seed.kind,
    label: seed.label,
    body: seed.body,
    summary: seed.summary ?? null,
    persona: seed.persona ?? null,
    trustTier: seed.trustTier,
    confidence: seed.confidence ?? null,
    refTable: seed.refTable ?? null,
    refId: seed.refId ?? null,
    source: seed.source ?? null,
    tags: seed.tags ?? [],
    createdBy: seed.createdBy ?? "arc",
    createdAt: ISO(seed.daysAgo ?? 30),
  };
}

let cachedNodes: BrainNode[] | null = null;
let cachedEdges: BrainEdge[] | null = null;

/** All demo brain nodes (most-recently-learned first, matching listNodes order). */
export function demoBrainNodes(): BrainNode[] {
  if (!cachedNodes) {
    cachedNodes = SEEDS.map(toNode).sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
  }
  return cachedNodes;
}

/** All demo brain edges, pruned to nodes that exist (defensive). */
export function demoBrainEdges(): BrainEdge[] {
  if (!cachedEdges) {
    const ids = new Set(SEEDS.map((s) => s.id));
    cachedEdges = EDGE_SEEDS.filter(([from, , to]) => ids.has(from) && ids.has(to)).map(
      ([from, relation, to], i): BrainEdge => ({
        id: `demo-edge-${i}`,
        fromNodeId: from,
        toNodeId: to,
        relation,
        weight: null,
        trustTier: "trusted",
      }),
    );
  }
  return cachedEdges;
}
