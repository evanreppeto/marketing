import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn(async () => {}) }));

describe("GET /api/v1/arc/media/diagnose", () => {
  afterEach(() => {
    delete process.env.ARC_MEDIA_ENABLED;
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
  });

  it("reports disabled + no key, leaking no secret value", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/v1/arc/media/diagnose"));
    const json = await res.json();
    expect(json.mediaEnabled).toBe(false);
    expect(json.geminiKeyPresent).toBe(false);
    expect(JSON.stringify(json)).not.toContain("sk-");
  });

  it("reports key present as a boolean, never the value", async () => {
    process.env.ARC_MEDIA_ENABLED = "1";
    process.env.GEMINI_API_KEY = "sk-secret-value-1234";
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/v1/arc/media/diagnose"));
    const json = await res.json();
    expect(json.mediaEnabled).toBe(true);
    expect(json.geminiKeyPresent).toBe(true);
    expect(JSON.stringify(json)).not.toContain("secret-value");
  });
});
