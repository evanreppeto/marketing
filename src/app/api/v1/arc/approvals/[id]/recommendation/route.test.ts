import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ addApprovalRecommendation: vi.fn() }));

import { addApprovalRecommendation } from "@/lib/arc-api";

import { POST } from "./route";

const addRecommendationMock = vi.mocked(addApprovalRecommendation);

function recRequest(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/approvals/ap1/recommendation", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "ap1" });

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  addRecommendationMock.mockReset();
  addRecommendationMock.mockResolvedValue({ ok: true, recommendationId: "rec-1" });
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/approvals/:id/recommendation (safety)", () => {
  it("returns 401 without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(recRequest("Bearer wrong", { recommendation: "x" }), { params });
    expect(res.status).toBe(401);
    expect(addRecommendationMock).not.toHaveBeenCalled();
  });

  it("rejects an empty recommendation with 400", async () => {
    configure();
    const res = await POST(recRequest("Bearer secret", { recommendation: "  " }), { params });
    expect(res.status).toBe(400);
    expect(addRecommendationMock).not.toHaveBeenCalled();
  });

  it("records a recommendation (201) — advisory only", async () => {
    configure();
    const res = await POST(
      recRequest("Bearer secret", { recommendation: "Tighten the CTA.", risk_flags: ["copy"] }),
      { params },
    );
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("recorded");
    // The only mutation this route can perform is adding a recommendation —
    // there is no approve/launch/send path reachable from here.
    expect(addRecommendationMock).toHaveBeenCalledWith(
      expect.objectContaining({ approvalItemId: "ap1", recommendation: "Tighten the CTA." }),
    );
  });

  it("returns 404 when the approval item does not exist", async () => {
    configure();
    addRecommendationMock.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await POST(recRequest("Bearer secret", { recommendation: "x" }), { params });
    expect(res.status).toBe(404);
  });
});
