import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateImage = vi.fn();
vi.mock("@/lib/media", () => ({
  isMediaGenEnabled: () => process.env.ARC_MEDIA_ENABLED === "1",
  getMediaProvider: () => ({ generateImage }),
}));
vi.mock("@/lib/media/storage", () => ({
  storeGeneratedImage: vi.fn(async () => "https://cdn.example/storage/v1/object/public/campaign-media/arc-generated/x.png"),
}));

import { POST } from "./route";

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/media/generate-image", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  ARC_MEDIA_ENABLED: process.env.ARC_MEDIA_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.ARC_MEDIA_ENABLED = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  generateImage.mockReset();
  generateImage.mockResolvedValue({
    bytes: Buffer.from("x"),
    contentType: "image/png",
    model: "gemini-2.5-flash-image",
    jobId: "job_1",
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/media/generate-image", () => {
  it("401 without a valid token, no generation", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    process.env.ARC_MEDIA_ENABLED = "1";
    const res = await POST(req("Bearer wrong", { prompt: "x" }));
    expect(res.status).toBe(401);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("503 when the flag is off", async () => {
    configure();
    process.env.ARC_MEDIA_ENABLED = "0";
    const res = await POST(req("Bearer secret", { prompt: "x" }));
    expect(res.status).toBe(503);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("400 when prompt is missing", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
  });

  it("201 with provenance-tagged media on success", async () => {
    configure();
    const res = await POST(req("Bearer secret", { prompt: "abstract blue gradient", aspect_ratio: "9:16" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.media).toMatchObject({
      kind: "image",
      url: "https://cdn.example/storage/v1/object/public/campaign-media/arc-generated/x.png",
      source: "ai_generated",
      format: "9:16",
      model: "gemini-2.5-flash-image",
    });
    expect(typeof json.objectPath).toBe("string");
    expect(json.objectPath).toMatch(/^arc-generated\//);
    // The prompt is hardened before the provider sees it: caller intent + no-text guard.
    const call = generateImage.mock.calls[0][0];
    expect(call.aspectRatio).toBe("9:16");
    expect(call.prompt).toContain("abstract blue gradient");
    expect(call.prompt).toMatch(/do not render any text/i);
  });
});
