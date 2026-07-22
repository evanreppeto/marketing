import { describe, expect, it } from "vitest";

import { scanMessage } from "./scan-feedback";

describe("scanMessage", () => {
  it("reports what was added", () => {
    expect(scanMessage({ ok: true, added: 3, filtered: 0 })).toBe("Added 3 opportunities.");
    expect(scanMessage({ ok: true, added: 1, filtered: 0 })).toBe("Added 1 opportunity.");
  });

  // The whole reason this line exists: an inbox that didn't change after a scan
  // reads as "nothing to find", when the truth may be "nothing cleared the bar".
  it("distinguishes finding nothing from finding nothing good enough", () => {
    expect(scanMessage({ ok: true, added: 0, filtered: 0 })).toBe(
      "No new opportunities — everything Arc found is already in your inbox.",
    );
    expect(scanMessage({ ok: true, added: 0, filtered: 12 })).toBe(
      "No new opportunities added — 12 signals below the confidence floor.",
    );
  });

  it("reports both halves when a scan added some and floored others", () => {
    expect(scanMessage({ ok: true, added: 2, filtered: 5 })).toBe(
      "Added 2 opportunities · 5 signals below the confidence floor.",
    );
    expect(scanMessage({ ok: true, added: 1, filtered: 1 })).toBe(
      "Added 1 opportunity · 1 signal below the confidence floor.",
    );
  });

  // `filtered` counts only confidence-floor rejections. Candidates skipped by
  // per-subject dedup are not in it, so the copy must not claim a broader
  // meaning like "skipped" or "ignored".
  it("attributes the filtered count specifically to the confidence floor", () => {
    const msg = scanMessage({ ok: true, added: 0, filtered: 4 });
    expect(msg).toContain("below the confidence floor");
    expect(msg).not.toMatch(/skipped|ignored|duplicate/i);
  });

  it("surfaces the error verbatim rather than a generic failure", () => {
    expect(scanMessage({ ok: false, error: "Connect a workspace to scan for opportunities." })).toBe(
      "Connect a workspace to scan for opportunities.",
    );
  });
});
