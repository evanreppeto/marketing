/**
 * Ensuring a click-through draft actually carries a link — pure, no I/O.
 *
 * Arc's email/landing copy ends in a bracketed placeholder — "[ Book a
 * no-obligation assessment ]" — with no URL behind it. dispatch/execute-resend
 * stamps outbound links with a `bsg_at` attribution token, but stampCampaignLinks
 * is a documented no-op when the body has no taggable links, so a placeholder-only
 * body sends no token, the recipient arrives with no campaign context, and the
 * journey collector (which only records attributable arrivals) sees nothing. The
 * whole journey → attribution → lens-picker chain breaks at this first link.
 *
 * So resolve the placeholder to a real link to the brand's own site before the
 * copy reaches approval. It is done at draft time, not dispatch time, on purpose:
 * the CTA is part of what the human reads and approves, not something appended to
 * approved copy on the way out.
 *
 * This decides; it does not fetch. The caller supplies websiteUrl (from the brand
 * profile) so the module stays pure and testable.
 */

/** Channels whose whole purpose is a click. Others (sms/social/one_pager) are left alone. */
const LINK_CHANNELS = new Set(["email", "landing_page"]);

// A bracketed CTA line like "[ Book a no-obligation assessment ]" — Arc's house
// placeholder. Captured so the label survives into the resolved link.
const PLACEHOLDER_CTA = /^\s*\[\s*(.+?)\s*\]\s*$/m;

const HTTP_URL = /^https?:\/\/\S+$/i;
const ANY_LINK = /https?:\/\/|\]\(|<a\s/i;

export type CtaResolution =
  | { kind: "not_applicable" } // channel doesn't need a link, or body already has one
  | { kind: "resolved"; body: string } // placeholder became a real link
  | { kind: "missing_destination"; reason: string }; // needs a link, has a placeholder, but no site to point at

/**
 * @param assetType  the campaign_assets asset_type
 * @param body       the draft copy
 * @param websiteUrl the brand's site (business_profiles.website_url), or null/empty
 */
export function resolveCampaignCta(
  assetType: string,
  body: string | null | undefined,
  websiteUrl: string | null | undefined,
): CtaResolution {
  const text = body ?? "";
  if (!LINK_CHANNELS.has(assetType)) return { kind: "not_applicable" };

  // Already links somewhere real (a human wrote a URL, or a prior resolve ran). Leave it.
  if (ANY_LINK.test(text)) return { kind: "not_applicable" };

  const match = text.match(PLACEHOLDER_CTA);
  if (!match) {
    // A click-channel draft with neither a link nor a recognizable CTA placeholder.
    // Nothing to anchor a link onto without rewriting the copy, which is the human's
    // job — surface it rather than guess where the button goes.
    return { kind: "missing_destination", reason: "The draft has no call-to-action link for the recipient to click." };
  }

  const site = (websiteUrl ?? "").trim();
  if (!HTTP_URL.test(site)) {
    return {
      kind: "missing_destination",
      reason:
        "The draft's call to action has no destination: set the brand website (Settings → Brand) so campaign links " +
        "point somewhere and can carry attribution.",
    };
  }

  const label = match[1].trim();
  // A bare URL on its own line under the label — NOT markdown. buildEmailPayload
  // escapeHtml()s the body and wraps paragraphs in <p>; it does not render markdown,
  // so a `[label](url)` would reach the inbox as literal text with no anchor to tag.
  // A bare https:// URL survives that escaping intact and is what stampCampaignLinks
  // matches in the text (and, once linkified by the mail client / a future renderer,
  // in the href). The label is kept as the human-readable prompt above it.
  const resolved = text.replace(PLACEHOLDER_CTA, `${label}: ${site}`);
  return { kind: "resolved", body: resolved };
}
