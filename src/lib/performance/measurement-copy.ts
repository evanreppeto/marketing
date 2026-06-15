/** Plain-language measurement checkpoints surfaced once a campaign goes live.
 *  Shared by the campaign Performance tab and the analytics campaign detail so
 *  the "what we'll measure / what's locked" copy stays in one place. */
export const MEASUREMENT_PLAN = [
  {
    area: "Reach",
    currentSignal: "Needs delivery data",
    question: "Did the target audience actually see this campaign?",
    nextStep: "Connect approved sending, publishing, or ad-platform results before reporting impressions, sends, clicks, or engagement.",
  },
  {
    area: "Response",
    currentSignal: "Needs lead events",
    question: "Did anyone call, submit a form, upload photos, or ask for help?",
    nextStep: "Track internal CTA, form, phone, and photo-upload events with the campaign id attached to each response.",
  },
  {
    area: "Quality",
    currentSignal: "Needs outcome data",
    question: "Were the responses from the right property, partner, or restoration scenario?",
    nextStep: "Join responses to lead, company, contact, job, and partner handoff records before ranking campaign quality.",
  },
  {
    area: "ROI",
    currentSignal: "Needs booked work",
    question: "Did the campaign lead to booked jobs or measurable revenue?",
    nextStep: "Only report ROI after approved campaigns are linked to outcomes, booked jobs, revenue, and attribution confidence.",
  },
] as const;

export const LOCKED_CLAIMS = [
  { title: "Ad performance", detail: "No live platform delivery data is attached yet, so clicks, impressions, CTR, and spend are not available." },
  { title: "Lead volume", detail: "No response events are linked yet, so the package cannot claim calls, forms, photo uploads, or conversions." },
  { title: "Revenue impact", detail: "No booked job or outcome attribution is linked yet, so ROI and revenue claims remain unavailable." },
  { title: "Optimization", detail: "No automatic sending, spending, publishing, or audience changes can run from this package without approval." },
] as const;

export type MeasurementPlanItem = (typeof MEASUREMENT_PLAN)[number];
export type LockedClaim = (typeof LOCKED_CLAIMS)[number];
