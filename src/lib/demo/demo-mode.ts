/**
 * Demo fallbacks (synthetic CRM/campaign/brain/persona/activity records) are
 * OFF by default so real, authenticated workspaces show real (possibly empty)
 * data. Set ARC_DEMO_DATA=1 for sales/marketing demos or local preview.
 */
export function isDemoDataEnabled(): boolean {
  return process.env.ARC_DEMO_DATA === "1";
}
