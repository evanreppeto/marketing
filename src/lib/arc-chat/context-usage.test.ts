import { describe, expect, it } from "vitest";

import { CONTEXT_WINDOW_TOKENS, contextUsage } from "./context-usage";

describe("contextUsage", () => {
  it("reports ok and low pct for a short conversation", () => {
    const u = contextUsage(["hi", "hello there", "what's next?"]);
    expect(u.level).toBe("ok");
    expect(u.pct).toBeLessThan(5);
    expect(u.tokens).toBeGreaterThan(0);
  });

  it("goes warn as it approaches the window", () => {
    const big = "x".repeat(CONTEXT_WINDOW_TOKENS * 4 * 0.85); // ~85% of the window
    expect(contextUsage([big]).level).toBe("warn");
  });

  it("clamps to 100 and reports full once the window is exceeded", () => {
    const huge = "y".repeat(CONTEXT_WINDOW_TOKENS * 4 * 2);
    const u = contextUsage([huge]);
    expect(u.pct).toBe(100);
    expect(u.level).toBe("full");
  });

  it("is empty for no messages", () => {
    expect(contextUsage([])).toEqual({ tokens: 0, pct: 0, level: "ok" });
  });
});
