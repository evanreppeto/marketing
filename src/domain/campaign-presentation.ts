/**
 * Pure display helpers for the campaigns surface. No I/O. Maps campaign data to
 * theme tones, the driving avatar (Mark vs operator), and the "needs you" count.
 */

export type CampaignLifecycle = "Drafting" | "In review" | "Ready" | "Live";

/** ThemeTone values understood by StatusPill. Kept as a local union to avoid a
 *  domain → app import; the strings must match `theme.pill` keys. */
export type CampaignTone = "amber" | "green" | "blue" | "gray" | "red" | "dark";

export function campaignLifecycleTone(lifecycle: CampaignLifecycle): CampaignTone {
  switch (lifecycle) {
    case "In review":
      return "amber"; // "needs you" — gold, never red
    case "Live":
      return "green";
    case "Ready":
      return "blue";
    case "Drafting":
    default:
      return "gray";
  }
}

export type CampaignDriver = "agent" | "operator";

/** Who is currently driving the campaign — drives the EntityAvatar. A Drafting
 *  campaign is always agent-driven (Mark is actively building it). */
export function campaignDriver(input: { sourceSystem: string | null; lifecycle: CampaignLifecycle }): CampaignDriver {
  if (input.lifecycle === "Drafting") return "agent";
  return input.sourceSystem === "operator" ? "operator" : "agent";
}

/** Pending approvals only count as "needs you" while the campaign is in review. */
export function needsYouCount(input: { lifecycle: CampaignLifecycle; pendingCount: number }): number {
  return input.lifecycle === "In review" ? input.pendingCount : 0;
}
