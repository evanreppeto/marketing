import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const VIEW_SOURCE = readFileSync(
  new URL("../../app/(app)/arc/_components/arc-view.tsx", import.meta.url),
  "utf8",
);
const CSS_SOURCE = readFileSync(
  new URL("../../app/(app)/arc/arc.css", import.meta.url),
  "utf8",
);

describe("Arc UI accessibility contract", () => {
  it("exposes the resolved workspace capability beside the composer", () => {
    expect(VIEW_SOURCE).toContain("arc-mode-button");
    expect(VIEW_SOURCE).toContain("Capability: ${capabilityLabel}");
    expect(VIEW_SOURCE).toContain('aria-label={composerMenu === "commands" ? "Skills menu" : composerMenu === "mode" ? "Capability menu"');
  });

  it("keeps the icon-only mobile review action named", () => {
    expect(VIEW_SOURCE).toContain('aria-label={`${needsReviewCards.length} items need review`}');
  });

  it("does not steal the global Command-K shortcut for drawer search", () => {
    expect(VIEW_SOURCE).not.toContain("event.metaKey || event.ctrlKey");
    expect(VIEW_SOURCE).not.toContain("⌘K");
  });

  it("keeps phone drawer actions visible and touch-sized", () => {
    expect(CSS_SOURCE).toContain(".arc-history-menu-btn { width: 44px; height: 44px; margin-right: 0; opacity: 1; }");
    expect(CSS_SOURCE).toContain(".arc-drawer-nav button { font-size: 10.5px; }");
  });
});
