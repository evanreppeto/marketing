import { afterEach, describe, expect, it, vi } from "vitest";

import { isDemoDataEnabled } from "./demo-mode";

afterEach(() => vi.unstubAllEnvs());

describe("isDemoDataEnabled", () => {
  it("is true only when ARC_DEMO_DATA === '1'", () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    expect(isDemoDataEnabled()).toBe(true);
  });
  it("is false when unset", () => {
    vi.stubEnv("ARC_DEMO_DATA", "");
    expect(isDemoDataEnabled()).toBe(false);
  });
  it("is false for other values", () => {
    vi.stubEnv("ARC_DEMO_DATA", "true");
    expect(isDemoDataEnabled()).toBe(false);
  });
});
