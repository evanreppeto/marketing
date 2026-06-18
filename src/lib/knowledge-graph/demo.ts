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
    body: "Big Shoulders Restoration's marketing operator. Everything the brain knows radiates from here.",
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
    label: "24/7 emergency response",
    body: "Big Shoulders Restoration answers emergency calls around the clock and dispatches crews within the hour across Chicagoland.",
    summary: "Always-on emergency line. Crews dispatched within the hour.",
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
    label: "IICRC-certified crews",
    body: "Every lead technician holds IICRC certification for water, fire, and mold remediation. Certifications are renewed annually.",
    summary: "IICRC-certified for water, fire, and mold.",
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
    label: "Chicago-area, locally operated",
    body: "Locally owned and operated since 2011. Crews know Chicago building stock, basements, and freeze-thaw weather patterns.",
    summary: "Local crews who know Chicago building stock.",
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
    label: "Direct insurance billing",
    body: "We document the loss with photos and moisture maps, then bill carriers directly so the homeowner is not out of pocket up front.",
    summary: "We document the loss and bill carriers directly.",
    trustTier: "trusted",
    confidence: 92,
    source: "Claims playbook",
    tags: ["insurance"],
    createdBy: "operator",
    daysAgo: 41,
  },

  // -- Services -------------------------------------------------------------
  {
    id: "svc_water",
    kind: "service",
    label: "Water damage mitigation",
    body: "Extraction, structural drying, and moisture monitoring after floods, burst pipes, and sewage backups.",
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
    label: "Fire & smoke restoration",
    body: "Soot removal, odor neutralization, and structural cleaning after fire and smoke damage.",
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
    label: "Mold remediation",
    body: "Containment, HEPA filtration, and antimicrobial treatment with post-remediation verification.",
    trustTier: "trusted",
    confidence: 93,
    source: "Service catalog",
    tags: ["mold"],
    createdBy: "operator",
    daysAgo: 80,
  },

  // -- Personas (12) --------------------------------------------------------
  persona("persona_homeowner_emergency", "Emergency Homeowner", "A homeowner mid-crisis — flooded basement, burst pipe — who needs a crew now.", ["homeowner", "emergency"], 91, 18),
  persona("persona_homeowner_preventative", "Inspection Homeowner", "A homeowner booking a preventative inspection before a problem becomes a claim.", ["homeowner"], 78, 33),
  persona("persona_homeowner_rebuild", "Rebuild Homeowner", "A homeowner past mitigation, now navigating reconstruction and an insurance claim.", ["homeowner", "insurance"], 84, 27),
  persona("persona_landlord", "Landlord", "An owner of one or more rental units who needs fast turnarounds to limit vacancy.", ["property"], 80, 22),
  persona("persona_hoa_board", "HOA Board Member", "A board member responsible for common-area damage and shared-cost decisions.", ["property"], 72, 45),
  persona("persona_property_manager", "Property Manager", "Manages a portfolio and needs one reliable restoration vendor on call.", ["property"], 82, 20),
  persona("persona_insurance_agent", "Insurance Agent", "An agent who refers a trusted restorer to keep claims clean and clients calm.", ["insurance", "referral"], 86, 15),
  persona("persona_listing_agent", "Listing Agent", "A listing agent who needs damage cleared fast so a home stays on-market.", ["real-estate"], 74, 38),
  persona("persona_buyers_agent", "Buyer Agent", "A buyer's agent flagging inspection findings that need remediation before close.", ["real-estate"], 70, 50),
  persona("persona_plumbing_partner", "Plumbing Partner", "A plumber who hits water damage on a job and hands off remediation.", ["partner"], 81, 24),
  persona("persona_hvac_roof_electrical_partner", "HVAC / Roofing / Electrical Partner", "A trade partner whose work overlaps with water and mold exposure.", ["partner"], 76, 36),
  persona("persona_gc_remodeler_partner", "GC / Remodeler Partner", "A general contractor who subs out mitigation to keep rebuilds moving.", ["partner"], 79, 30),

  // -- Proof points ---------------------------------------------------------
  {
    id: "pp_homes",
    kind: "proof_point",
    label: "4,200+ homes restored",
    body: "Over 4,200 Chicagoland properties restored since 2011 — the headline credibility stat for cold outreach.",
    summary: "4,200+ properties restored since 2011.",
    trustTier: "trusted",
    confidence: 90,
    source: "Internal job ledger",
    tags: ["stat", "credibility"],
    createdBy: "operator",
    daysAgo: 12,
  },
  {
    id: "pp_response",
    kind: "proof_point",
    label: "47-minute average arrival",
    body: "Average crew arrival time on emergency dispatches over the last 12 months was 47 minutes.",
    summary: "47-minute average emergency arrival.",
    trustTier: "trusted",
    confidence: 88,
    source: "Dispatch logs",
    tags: ["stat", "speed"],
    createdBy: "operator",
    daysAgo: 9,
  },
  {
    id: "pp_rating",
    kind: "proof_point",
    label: "4.9★ across 600+ reviews",
    body: "Aggregate 4.9-star rating across Google and Yelp from more than 600 verified reviews.",
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
    label: "Testimonial — Lincoln Park basement",
    body: '"Crew was at our door in under an hour and walked us through the insurance claim step by step." — verified homeowner, Lincoln Park.',
    summary: "Lincoln Park homeowner testimonial.",
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
    label: "Emergency Water Response Program",
    body: "Always-on campaign package for the Emergency Homeowner — fast-arrival promise, insurance-billing reassurance, and before/after proof.",
    summary: "Always-on emergency-water campaign for homeowners.",
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
    label: "Spring Storm Prep",
    body: "Seasonal preventative push to inspection homeowners and property managers ahead of spring thaw and storms.",
    summary: "Seasonal storm-prep campaign.",
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
    label: "Trade Partner Referral Loop",
    body: "Partner-nurture sequence that keeps Big Shoulders top-of-mind for plumbers, GCs, and trades who hand off remediation.",
    summary: "Referral nurture for trade partners.",
    trustTier: "observed",
    confidence: 64,
    source: "Campaigns",
    tags: ["partner", "referral"],
    createdBy: "arc",
    daysAgo: 8,
  },

  // -- Customer objections --------------------------------------------------
  {
    id: "obj_insurance",
    kind: "messaging_angle",
    label: 'Objection: "Won\'t insurance cover this?"',
    body: "Homeowners hesitate, assuming the carrier handles everything. Reframe: we document the loss and bill the carrier directly, so calling us protects the claim rather than complicating it.",
    summary: "Reframe insurance worry as claim protection.",
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
    label: 'Objection: "I can dry it out myself"',
    body: "Self-mitigation misses moisture behind walls that becomes mold weeks later. Lead with the hidden-moisture risk and our moisture-mapping verification.",
    summary: "Counter DIY with hidden-moisture / mold risk.",
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
    body: "Price anxiety stalls emergency calls. Lead with direct insurance billing and a free on-site assessment so cost is not the first hurdle.",
    summary: "Defuse cost anxiety with billing + free assessment.",
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
    label: "Email — emergency line CTA",
    body: 'Primary email call to action: "Call our 24/7 line" with click-to-dial. Best performer for the Emergency Homeowner persona.',
    summary: "Click-to-dial emergency CTA for email.",
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
    label: "SMS — fast dispatch reply",
    body: "SMS works for re-engagement and dispatch confirmations. Keep under 160 chars, lead with arrival promise.",
    summary: "SMS for dispatch + re-engagement.",
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
    body: "Before/after creative drives the strongest paid-social engagement. Pair with the 4,200-homes proof point.",
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
    label: "Speed beats price in emergency copy",
    body: "Across emergency campaigns, leading with arrival speed outperformed leading with price or certifications by a wide margin on reply rate.",
    summary: "Lead emergency copy with speed, not price.",
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
    body: "Swapping stock imagery for real before/after restoration photos lifted paid-social click-through meaningfully.",
    summary: "Real before/after photos beat stock.",
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
    label: "Freeze-thaw burst-pipe risk rising",
    body: "Forecast shows a freeze-thaw swing across Chicagoland this week — a leading indicator of burst-pipe emergency volume.",
    summary: "Freeze-thaw swing → burst-pipe risk.",
    trustTier: "observed",
    confidence: 62,
    source: "Weather feed",
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
    label: "5-year workmanship warranty",
    body: "Arc drafted a 5-year workmanship warranty claim from a sales deck. Awaiting operator approval before use in campaigns.",
    summary: "Drafted 5-year warranty claim — awaiting approval.",
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
    label: "Commercial property segment",
    body: "Arc noticed a cluster of multifamily and commercial leads that may warrant their own segment and messaging track.",
    summary: "Possible commercial/multifamily segment.",
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
