/**
 * Industry starter templates. At onboarding a tenant picks an industry and its
 * workspace is seeded that industry's persona pack (with tailored message angles
 * + CTAs) instead of the neutral default — so the app feels built for them on day
 * one. This is pure seed data: every pack maps to the same `personas` rows, and
 * Track 1's org-aware pickers/gates consume whatever gets seeded.
 *
 * `general` reuses the neutral DEFAULT_PERSONAS and is the fallback for an unknown
 * or unset industry. Slugs are the keys records are tagged with — keep them
 * lowercase-kebab, generic, and unique within a pack.
 */
import { DEFAULT_PERSONAS, type DefaultPersonaSeed } from "./default-personas";

export type IndustryTemplate = {
  /** Stable key stored on `business_profiles.industry`. */
  key: string;
  label: string;
  personas: DefaultPersonaSeed[];
};

const RESTORATION: DefaultPersonaSeed[] = [
  {
    slug: "emergency-homeowner",
    name: "Emergency homeowner",
    segment: "acquisition",
    stage: "New",
    angle: "Respond in minutes and document everything for the insurance claim.",
    audience: "Homeowners hit by sudden water, fire, or storm damage who need help now.",
    cta: "Call now for 24/7 emergency response",
  },
  {
    slug: "insurance-partner",
    name: "Insurance agent / adjuster",
    segment: "acquisition",
    stage: "Active",
    angle: "Be the contractor who makes every claim clean, fast, and defensible.",
    audience: "Adjusters and agents who refer trusted restoration vendors.",
    cta: "Add us to your preferred vendor list",
  },
  {
    slug: "property-manager",
    name: "Property manager",
    segment: "engagement",
    stage: "Active",
    angle: "One call handles the damage across every unit you manage.",
    audience: "Managers of multi-unit and commercial buildings.",
    cta: "Set up a priority response agreement",
  },
  {
    slug: "past-restoration-client",
    name: "Past client",
    segment: "retention",
    stage: "Champion",
    angle: "Prevent the next loss and make it easy to send a neighbor our way.",
    audience: "Homeowners we've restored who can refer and re-engage.",
    cta: "Book a preventative inspection",
  },
];

const HOME_SERVICES: DefaultPersonaSeed[] = [
  {
    slug: "emergency-repair",
    name: "Emergency repair",
    segment: "acquisition",
    stage: "New",
    angle: "A fast, upfront-priced fix when something stops working.",
    audience: "Homeowners with a broken system who need same-day service.",
    cta: "Book a same-day visit",
  },
  {
    slug: "new-install-quote",
    name: "New install / replacement",
    segment: "acquisition",
    stage: "Hot lead",
    angle: "A right-sized system and financing that fits the budget.",
    audience: "Homeowners replacing or installing a major system.",
    cta: "Get a free in-home estimate",
  },
  {
    slug: "maintenance-member",
    name: "Maintenance member",
    segment: "engagement",
    stage: "Active",
    angle: "Keep it running and skip the emergency with a service plan.",
    audience: "Customers on or ready for a maintenance membership.",
    cta: "Enroll in the maintenance plan",
  },
  {
    slug: "commercial-account",
    name: "Commercial account",
    segment: "retention",
    stage: "Champion",
    angle: "Priority service and one vendor for every location.",
    audience: "Facility managers and commercial property owners.",
    cta: "Set up a commercial service agreement",
  },
];

const PROFESSIONAL_SERVICES: DefaultPersonaSeed[] = [
  {
    slug: "new-inquiry",
    name: "New inquiry",
    segment: "acquisition",
    stage: "New",
    angle: "Answer the pressing question and make the first consult easy to book.",
    audience: "Prospects deciding whether to hire a firm like yours.",
    cta: "Book a free consultation",
  },
  {
    slug: "active-client",
    name: "Active client",
    segment: "engagement",
    stage: "Active",
    angle: "Keep them informed and confident through the engagement.",
    audience: "Current clients in an active matter or engagement.",
    cta: "Review your case status",
  },
  {
    slug: "referral-source",
    name: "Referral source",
    segment: "retention",
    stage: "Champion",
    angle: "Make it effortless for partners to send work your way.",
    audience: "Other professionals and past clients who refer business.",
    cta: "Refer a colleague",
  },
  {
    slug: "dormant-client",
    name: "Dormant client",
    segment: "retention",
    stage: "Dormant",
    angle: "Re-open the relationship before they go elsewhere.",
    audience: "Past clients with no active matter in a while.",
    cta: "Schedule a check-in",
  },
];

const AGENCY: DefaultPersonaSeed[] = [
  {
    slug: "inbound-lead",
    name: "Inbound lead",
    segment: "acquisition",
    stage: "New",
    angle: "Show the outcome you'd drive and make discovery frictionless.",
    audience: "Brands evaluating agencies for a project or retainer.",
    cta: "Book a discovery call",
  },
  {
    slug: "pitch-opportunity",
    name: "Pitch opportunity",
    segment: "acquisition",
    stage: "Hot lead",
    angle: "Prove fit fast with relevant work and a clear plan.",
    audience: "Qualified prospects in an active pitch or proposal.",
    cta: "See a tailored proposal",
  },
  {
    slug: "retainer-client",
    name: "Retainer client",
    segment: "engagement",
    stage: "Active",
    angle: "Show momentum and results every cycle.",
    audience: "Clients on an active retainer.",
    cta: "Review this month's results",
  },
  {
    slug: "churned-client",
    name: "Churned client",
    segment: "retention",
    stage: "Dormant",
    angle: "Win them back with a fresh angle and a quick win.",
    audience: "Former clients who paused or left.",
    cta: "Restart with a strategy session",
  },
];

const HEALTHCARE: DefaultPersonaSeed[] = [
  {
    slug: "new-patient",
    name: "New patient",
    segment: "acquisition",
    stage: "New",
    angle: "Make the first visit easy, welcoming, and clear on cost.",
    audience: "Prospective patients searching for a provider.",
    cta: "Book your first visit",
  },
  {
    slug: "treatment-lead",
    name: "Treatment lead",
    segment: "acquisition",
    stage: "Hot lead",
    angle: "Explain the plan and options so they feel confident saying yes.",
    audience: "Patients considering a specific treatment or procedure.",
    cta: "Schedule a consultation",
  },
  {
    slug: "membership-patient",
    name: "Recurring patient",
    segment: "engagement",
    stage: "Active",
    angle: "Keep them on schedule and glad they chose you.",
    audience: "Members and recurring patients.",
    cta: "Book your next appointment",
  },
  {
    slug: "lapsed-patient",
    name: "Lapsed patient",
    segment: "retention",
    stage: "At risk",
    angle: "Bring them back before the gap becomes permanent.",
    audience: "Patients overdue for a visit or recall.",
    cta: "Reschedule your overdue visit",
  },
];

const REAL_ESTATE: DefaultPersonaSeed[] = [
  {
    slug: "buyer-lead",
    name: "Buyer lead",
    segment: "acquisition",
    stage: "New",
    angle: "Match them to the right listings and guide the whole way.",
    audience: "People starting a home search.",
    cta: "Get matched to listings",
  },
  {
    slug: "seller-lead",
    name: "Seller lead",
    segment: "acquisition",
    stage: "Hot lead",
    angle: "Show what their home is worth and how you'll sell it.",
    audience: "Homeowners considering selling.",
    cta: "Get a free home valuation",
  },
  {
    slug: "investor",
    name: "Investor",
    segment: "engagement",
    stage: "Active",
    angle: "Bring deals that fit their numbers.",
    audience: "Repeat investors and portfolio buyers.",
    cta: "See off-market opportunities",
  },
  {
    slug: "past-client",
    name: "Past client",
    segment: "retention",
    stage: "Champion",
    angle: "Stay top of mind for their next move and their referrals.",
    audience: "Past buyers and sellers.",
    cta: "Refer a friend",
  },
];

const SAAS: DefaultPersonaSeed[] = [
  {
    slug: "free-trial",
    name: "Free trial",
    segment: "acquisition",
    stage: "New",
    angle: "Get them to the first win fast.",
    audience: "Users evaluating in a trial or free plan.",
    cta: "Finish setup",
  },
  {
    slug: "active-user",
    name: "Active user",
    segment: "engagement",
    stage: "Active",
    angle: "Deepen adoption and surface the next useful feature.",
    audience: "Engaged users on a paid plan.",
    cta: "Explore what's next",
  },
  {
    slug: "expansion-champion",
    name: "Expansion champion",
    segment: "retention",
    stage: "Champion",
    angle: "Turn power users into advocates and seat expansion.",
    audience: "Champions who can expand or refer.",
    cta: "Add your team",
  },
  {
    slug: "churn-risk",
    name: "Churn risk",
    segment: "retention",
    stage: "At risk",
    angle: "Re-earn value before the renewal slips.",
    audience: "Accounts with declining usage.",
    cta: "Book a success check-in",
  },
];

const ECOMMERCE: DefaultPersonaSeed[] = [
  {
    slug: "first-time-shopper",
    name: "First-time shopper",
    segment: "acquisition",
    stage: "New",
    angle: "Remove the doubt and make the first order easy.",
    audience: "New visitors and first-time buyers.",
    cta: "Complete your first order",
  },
  {
    slug: "repeat-buyer",
    name: "Repeat buyer",
    segment: "engagement",
    stage: "Active",
    angle: "Bring them back with what pairs with their last order.",
    audience: "Customers who've ordered before.",
    cta: "Reorder your favorites",
  },
  {
    slug: "vip-loyalty",
    name: "VIP / loyalty",
    segment: "retention",
    stage: "Champion",
    angle: "Reward loyalty and turn fans into referrers.",
    audience: "Top spenders and loyalty members.",
    cta: "Unlock your VIP perks",
  },
  {
    slug: "win-back",
    name: "Win-back",
    segment: "retention",
    stage: "Dormant",
    angle: "Rekindle interest before they forget you.",
    audience: "Lapsed customers who haven't purchased in a while.",
    cta: "Come back for something new",
  },
];

/** Ordered so `general` is first (the default/fallback). */
export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  { key: "general", label: "General / other", personas: DEFAULT_PERSONAS },
  { key: "restoration", label: "Restoration & property recovery", personas: RESTORATION },
  { key: "home_services", label: "Home & field services", personas: HOME_SERVICES },
  { key: "professional_services", label: "Professional services", personas: PROFESSIONAL_SERVICES },
  { key: "agency", label: "Marketing & creative agency", personas: AGENCY },
  { key: "healthcare", label: "Healthcare, dental & med spa", personas: HEALTHCARE },
  { key: "real_estate", label: "Real estate", personas: REAL_ESTATE },
  { key: "saas", label: "SaaS & B2B tech", personas: SAAS },
  { key: "ecommerce", label: "E-commerce & retail", personas: ECOMMERCE },
];

/** Picker options for the onboarding form. */
export const INDUSTRY_OPTIONS = INDUSTRY_TEMPLATES.map((t) => ({ value: t.key, label: t.label }));

const BY_KEY = new Map(INDUSTRY_TEMPLATES.map((t) => [t.key, t]));

/** True when `industry` is a known template key. */
export function isKnownIndustry(industry: string | undefined | null): boolean {
  return industry != null && BY_KEY.has(industry);
}

/**
 * The persona pack for an industry — falls back to the neutral `general` set for
 * an unknown or unset industry.
 */
export function personasForIndustry(industry?: string | null): DefaultPersonaSeed[] {
  return (industry ? BY_KEY.get(industry) : undefined)?.personas ?? DEFAULT_PERSONAS;
}
