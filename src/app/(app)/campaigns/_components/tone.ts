/**
 * The campaign board's tone vocabulary, and the one definition of "waiting on you".
 *
 * Not a client module on purpose: the server page and the client board both need
 * `needsOperatorApproval`, and every export of a "use client" module becomes a
 * client reference when a server component imports it.
 *
 * This exists because the board and its footer disagreed in front of the operator.
 * The "Needs approval" tab counted tone (4); the footer counted rows whose
 * *rendered* next-action string matched /Approve/ (9) and announced "Arc has 9
 * packages awaiting your approval" directly beneath a tab reading 4. Two answers to
 * one question on one screen — and the 9 was derived from a display label, so
 * rewording "Approve 1 piece" would have silently zeroed it.
 *
 * Both now call this. They cannot drift again without someone deleting it.
 */

export type CampaignTone = "live" | "review" | "revise" | "approved" | "draft" | "archived";

/**
 * Is this package waiting on a human decision?
 *
 * `revise` counts: a revision-requested or blocked package is on the operator's
 * desk just as much as one pending approval — it is the "Needs approval" tab's
 * own rule, kept here so the tab and any summary of it agree by construction.
 */
export function needsOperatorApproval(tone: CampaignTone): boolean {
  return tone === "review" || tone === "revise";
}
