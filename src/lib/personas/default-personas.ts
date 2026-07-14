/**
 * Neutral, industry-agnostic starter personas seeded into every NEW workspace so
 * the Personas console, CRM, and Arc have something to work with on day one —
 * without any restoration/BSR bias. Every field is generic; tenants rename,
 * edit, archive, or add their own from here. BSR's specific 12 personas live in
 * the demo seed scripts (`scripts/seed-personas.mjs`), not here.
 *
 * `slug` is the stable key records are tagged with — keep these lowercase-kebab.
 */
export type DefaultPersonaSeed = {
  slug: string;
  name: string;
  segment: "acquisition" | "engagement" | "retention";
  stage: string;
  angle: string;
  audience: string;
  /** Recommended call-to-action; optional (blank for the neutral set is fine). */
  cta?: string;
};

export const DEFAULT_PERSONAS: DefaultPersonaSeed[] = [
  {
    slug: "new-lead",
    name: "New lead",
    segment: "acquisition",
    stage: "New",
    angle: "Answer the question that brought them in and make the next step effortless.",
    audience: "People who just discovered you and are sizing up whether you're the right fit.",
    cta: "Take the next step",
  },
  {
    slug: "active-customer",
    name: "Active customer",
    segment: "engagement",
    stage: "Active",
    angle: "Reinforce the value they're already getting and surface the next best thing to do.",
    audience: "Current customers actively using what you offer.",
    cta: "See what's next",
  },
  {
    slug: "champion",
    name: "Champion",
    segment: "retention",
    stage: "Champion",
    angle: "Give them easy ways to refer, review, and advocate — they already love you.",
    audience: "Your happiest customers and repeat buyers who spread the word.",
    cta: "Refer a friend",
  },
  {
    slug: "at-risk",
    name: "At-risk",
    segment: "retention",
    stage: "At risk",
    angle: "Re-earn attention with a concrete reason to come back before they churn.",
    audience: "Customers who've gone quiet or shown signs of drifting away.",
    cta: "Come back",
  },
];
