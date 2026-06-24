import { describe, expect, it } from "vitest";

import { renderBrandedEmail } from "@/domain";

const theme = { appName: "Summit", logoUrl: "https://cdn.example.com/logo.png", accentColor: "#0B0B0C" };

describe("renderBrandedEmail", () => {
  it("renders heading, body paragraphs, and a CTA button in the html", () => {
    const { html } = renderBrandedEmail({
      heading: "Join Summit",
      bodyBlocks: ["You've been invited.", "Click below to accept."],
      cta: { label: "Accept invitation", url: "https://app.example.com/auth/confirm?code=abc" },
      theme,
    });
    expect(html).toContain("Join Summit");
    expect(html).toContain("You&#39;ve been invited.");
    expect(html).toContain("Click below to accept.");
    expect(html).toContain('href="https://app.example.com/auth/confirm?code=abc"');
    expect(html).toContain("Accept invitation");
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("produces a plaintext alternative with the CTA url spelled out", () => {
    const { text } = renderBrandedEmail({
      heading: "Join Summit",
      bodyBlocks: ["You've been invited."],
      cta: { label: "Accept invitation", url: "https://app.example.com/x" },
      theme,
    });
    expect(text).toContain("Join Summit");
    expect(text).toContain("You've been invited.");
    expect(text).toContain("Accept invitation: https://app.example.com/x");
  });

  it("escapes html in body content and omits the logo + button when not provided", () => {
    const { html } = renderBrandedEmail({
      heading: "Hi <there>",
      bodyBlocks: ["A & B <script>"],
      theme: { appName: "Summit", accentColor: "#0B0B0C" },
    });
    expect(html).toContain("Hi &lt;there&gt;");
    expect(html).toContain("A &amp; B &lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
  });
});
