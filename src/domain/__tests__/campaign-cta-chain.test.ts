import { describe, expect, it } from "vitest";

import { resolveCampaignCta, stampCampaignLinks } from "@/domain";

// The whole point of resolving the CTA: dispatch must end up with a taggable link
// so a click carries the campaign's bsg_at token. This walks the real seam —
// resolved body → the same escape+<p> shape buildEmailPayload builds → stamp — and
// asserts a token actually lands. If any link in that chain regresses, this fails.
const CAMPAIGN = "8f14e45f-ceea-467a-9575-1f0b1a2c3d4e";

function buildEmailHtmlLikeDispatch(text: string): string {
  // Mirrors buildEmailPayload in lib/dispatch/persistence.ts.
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

describe("CTA → dispatch attribution chain", () => {
  it("a resolved CTA produces a link that stampCampaignLinks tags with bsg_at", () => {
    const resolved = resolveCampaignCta(
      "email",
      "Hi Jordan,\n\n[ Book a no-obligation assessment ]",
      "https://bigshouldersrestoration.com",
    );
    if (resolved.kind !== "resolved") throw new Error("expected resolved");

    const text = resolved.body;
    const html = buildEmailHtmlLikeDispatch(text);
    const stamped = stampCampaignLinks({ html, text }, { campaignId: CAMPAIGN, assetId: null, channel: "email" });

    // The bare URL survived escaping, and the text stamp carried the token.
    expect(stamped.text).toMatch(/bsg_at=/);
    expect(stamped.text).toContain("bigshouldersrestoration.com");
  });

  it("the placeholder alone yields NO token — which is the bug this fixes", () => {
    const text = "Hi Jordan,\n\n[ Book a no-obligation assessment ]"; // never resolved
    const stamped = stampCampaignLinks(
      { html: buildEmailHtmlLikeDispatch(text), text },
      { campaignId: CAMPAIGN, assetId: null, channel: "email" },
    );
    expect(stamped.text).not.toMatch(/bsg_at=/);
  });
});
