import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/api/v1/arc/_lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/v1/arc/_lib/http")>();
  return {
    ...actual,
    arcGuard: vi.fn(async () => ({ ok: true, scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" } })),
  };
});
vi.mock("@/lib/media", () => ({ isMediaGenEnabled: vi.fn(() => true) }));
vi.mock("@/lib/brand-kit/persistence", () => ({ getBusinessProfile: vi.fn(async () => null) }));
vi.mock("@/lib/media/compose/renderer", () => ({
  renderCreative: vi.fn(async () => ({ bytes: Buffer.from("png-bytes"), contentType: "image/png" })),
}));
vi.mock("@/lib/media/storage", () => ({ storeGeneratedMedia: vi.fn(async () => "https://cdn.example/composite.png") }));

import { POST } from "./route";
import { isMediaGenEnabled } from "@/lib/media";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/v1/arc/media/compose", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/arc/media/compose", () => {
  it("returns 201 with a composite-tagged media object", async () => {
    const res = await post({ background_url: "https://cdn.example/bg.png", headline: "Flooded?", cta_label: "Call now" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { media: { url: string; source: string; format: string }; template: string };
    expect(json.media.url).toBe("https://cdn.example/composite.png");
    expect(json.media.source).toBe("composite");
    expect(json.media.format).toBe("1:1");
    expect(["bold", "editorial", "minimal"]).toContain(json.template);
  });

  it("rejects when background_url is missing", async () => {
    const res = await post({ headline: "Flooded?" });
    expect(res.status).toBe(400);
  });

  it("rejects when headline is missing", async () => {
    const res = await post({ background_url: "https://cdn.example/bg.png" });
    expect(res.status).toBe(400);
  });

  it("returns 503 when media gen is disabled", async () => {
    vi.mocked(isMediaGenEnabled).mockReturnValueOnce(false);
    const res = await post({ background_url: "https://cdn.example/bg.png", headline: "Flooded?" });
    expect(res.status).toBe(503);
  });
});
