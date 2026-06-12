import { describe, expect, it } from "vitest";

import { normalizeBaseUrl, resolveAppBaseUrl } from "./app-url";

describe("resolveAppBaseUrl", () => {
  it("uses the explicit Growth app URL first", () => {
    expect(resolveAppBaseUrl(null, { GROWTH_APP_BASE_URL: "https://acme.example/" })).toBe("https://acme.example");
  });

  it("normalizes Vercel deployment hostnames", () => {
    expect(resolveAppBaseUrl(null, { VERCEL_PROJECT_PRODUCTION_URL: "growth-engine.vercel.app" })).toBe(
      "https://growth-engine.vercel.app",
    );
  });

  it("falls back to forwarded request headers", () => {
    const headers = new Headers({
      "x-forwarded-host": "acme.growthengine.com",
      "x-forwarded-proto": "https",
    });
    expect(resolveAppBaseUrl(headers, {})).toBe("https://acme.growthengine.com");
  });

  it("uses localhost when no deployment context exists", () => {
    expect(resolveAppBaseUrl(null, {})).toBe("http://localhost:3000");
  });
});

describe("normalizeBaseUrl", () => {
  it("adds https and strips trailing slashes", () => {
    expect(normalizeBaseUrl("acme.growthengine.com///")).toBe("https://acme.growthengine.com");
  });
});
