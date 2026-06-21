/**
 * Neutral, cross-industry demo personas for the generic Personas console.
 *
 * This is intentionally NOT BSR-specific — the Personas surface is a product
 * for any business, so the roster, segments, and fields are generic. Real
 * deployments load each org's own persona + segment definitions; until that
 * per-org wiring lands, the page renders this sample set so the experience is
 * complete and obviously industry-agnostic.
 */

export type PersonaSegmentKey = "acquisition" | "engagement" | "retention";

export type PersonaStage = "New" | "Hot lead" | "Active" | "Champion" | "At risk" | "Dormant";

export type ScoreSignalKey = "engagement" | "fit" | "intent";

export type DemoPersona = {
  slug: string;
  name: string;
  initials: string;
  segment: PersonaSegmentKey;
  stage: PersonaStage;
  score: number;
  signals: Record<ScoreSignalKey, number>;
  live: boolean;
  angle: string;
  audience: string;
  cta: string;
  channel: string;
  nextAction: string;
  proofPoints: string[];
};

export type PersonaSegment = { key: PersonaSegmentKey; label: string; blurb: string };

export const PERSONA_SEGMENTS: PersonaSegment[] = [
  { key: "acquisition", label: "Acquisition", blurb: "People discovering and evaluating you." },
  { key: "engagement", label: "Engagement", blurb: "Recently active — building the habit." },
  { key: "retention", label: "Retention", blurb: "Keeping, growing, and winning back customers." },
];

/**
 * The explainable signals a lead score is composed of. Scoring is deterministic
 * and app-owned (not a model black box) — the persona page shows this breakdown.
 */
export const SCORE_SIGNALS: Array<{ key: ScoreSignalKey; label: string; hint: string }> = [
  { key: "engagement", label: "Engagement", hint: "Recency and frequency of activity" },
  { key: "fit", label: "Fit", hint: "Match to your ideal customer profile" },
  { key: "intent", label: "Intent", hint: "Buying and readiness signals" },
];

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    slug: "new-prospect",
    name: "New Prospect",
    initials: "NP",
    segment: "acquisition",
    stage: "New",
    score: 71,
    signals: { engagement: 55, fit: 80, intent: 78 },
    live: false,
    angle: "Discovering you for the first time — needs trust and a reason to start.",
    audience: "First-touch visitors who don't know you yet.",
    cta: "Start free / Learn more",
    channel: "Search & social",
    nextAction: "Offer a low-friction first step backed by recognizable social proof.",
    proofPoints: ["Recognizable customers", "Clear, no-risk starting offer"],
  },
  {
    slug: "high-intent-lead",
    name: "High-Intent Lead",
    initials: "HL",
    segment: "acquisition",
    stage: "Hot lead",
    score: 86,
    signals: { engagement: 82, fit: 84, intent: 92 },
    live: true,
    angle: "Actively comparing options and close to a decision.",
    audience: "Engaged leads showing strong buying signals.",
    cta: "Book a demo / Talk to sales",
    channel: "Email & retargeting",
    nextAction: "Reach out quickly with a tailored comparison and fast next step.",
    proofPoints: ["Side-by-side comparison", "Fast time-to-value"],
  },
  {
    slug: "bargain-seeker",
    name: "Bargain Seeker",
    initials: "BS",
    segment: "acquisition",
    stage: "New",
    score: 58,
    signals: { engagement: 60, fit: 50, intent: 64 },
    live: false,
    angle: "Price-driven — responds to offers and clear proof of value.",
    audience: "Deal-sensitive shoppers weighing cost against value.",
    cta: "See pricing / Claim offer",
    channel: "Email & promotions",
    nextAction: "Lead with transparent value and a time-bound incentive.",
    proofPoints: ["Transparent pricing", "Money-back guarantee"],
  },
  {
    slug: "first-time-buyer",
    name: "First-time Buyer",
    initials: "FB",
    segment: "engagement",
    stage: "Active",
    score: 79,
    signals: { engagement: 85, fit: 78, intent: 74 },
    live: false,
    angle: "Just converted — needs a confident, simple onboarding.",
    audience: "Brand-new customers in their first days with you.",
    cta: "Finish setup / Quick start",
    channel: "Email & in-product",
    nextAction: "Guide them to a first meaningful win quickly.",
    proofPoints: ["Step-by-step onboarding", "Responsive support"],
  },
  {
    slug: "repeat-customer",
    name: "Repeat Customer",
    initials: "RC",
    segment: "engagement",
    stage: "Active",
    score: 84,
    signals: { engagement: 90, fit: 82, intent: 80 },
    live: true,
    angle: "Comes back regularly and is ready for more.",
    audience: "Returning customers with steady, healthy activity.",
    cta: "Recommended for you / Upgrade",
    channel: "Email & in-product",
    nextAction: "Surface the next relevant offer based on their history.",
    proofPoints: ["Personalized recommendations", "Loyalty perks"],
  },
  {
    slug: "loyal-advocate",
    name: "Loyal Advocate",
    initials: "LA",
    segment: "retention",
    stage: "Champion",
    score: 95,
    signals: { engagement: 97, fit: 95, intent: 93 },
    live: false,
    angle: "Loves you — ready to refer and leave a review.",
    audience: "Your happiest, most engaged customers.",
    cta: "Refer a friend / Leave a review",
    channel: "Email & community",
    nextAction: "Invite them to refer, and reward it.",
    proofPoints: ["Referral rewards", "Community recognition"],
  },
  {
    slug: "at-risk-customer",
    name: "At-Risk Customer",
    initials: "AR",
    segment: "retention",
    stage: "At risk",
    score: 46,
    signals: { engagement: 35, fit: 60, intent: 43 },
    live: false,
    angle: "Engagement slipping — needs a reason to stay.",
    audience: "Customers trending toward churn.",
    cta: "Re-engage / Check in",
    channel: "Email & SMS",
    nextAction: "Reach out with help and a concrete reason to return.",
    proofPoints: ["Proactive support", "What's new since they last engaged"],
  },
  {
    slug: "lapsed-customer",
    name: "Lapsed Customer",
    initials: "LC",
    segment: "retention",
    stage: "Dormant",
    score: 34,
    signals: { engagement: 20, fit: 55, intent: 27 },
    live: false,
    angle: "Gone quiet — a win-back moment worth timing well.",
    audience: "Previously active customers who have lapsed.",
    cta: "Win-back offer / We miss you",
    channel: "Email",
    nextAction: "Time a win-back around a fresh reason to return.",
    proofPoints: ["What's improved", "Welcome-back incentive"],
  },
];

export function parsePersonaSegment(value: string | undefined): PersonaSegmentKey | "all" {
  return PERSONA_SEGMENTS.some((segment) => segment.key === value) ? (value as PersonaSegmentKey) : "all";
}

export function getPersonaBySlug(slug: string | undefined): DemoPersona | null {
  return DEMO_PERSONAS.find((persona) => persona.slug === slug) ?? null;
}

export function segmentLabel(key: PersonaSegmentKey): string {
  return PERSONA_SEGMENTS.find((segment) => segment.key === key)?.label ?? key;
}
