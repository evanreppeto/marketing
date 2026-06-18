import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org_1") }));
vi.mock("@/lib/brand-kit/read-model", () => ({ getBusinessContext: vi.fn() }));

import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessContext } from "@/lib/brand-kit/read-model";
import { GET } from "./route";

const orgMock = vi.mocked(getCurrentOrgId);
const ctxMock = vi.mocked(getBusinessContext);

function req(authorization: string | undefined) {
  return new Request("http://localhost/api/v1/arc/brand/context", {
    headers: { ...(authorization ? { authorization } : {}) },
  });
}

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
  orgMock.mockReset();
  ctxMock.mockReset();
  orgMock.mockResolvedValue("org_1");
  ctxMock.mockResolvedValue({
    businessName: "Big Shoulders Restoration",
    industry: "restoration",
    services: ["water", "mold"],
    tone: "calm",
    voiceGuidance: null,
    preferredPhrases: [],
    bannedPhrases: ["guarantee"],
    proofPoints: [],
    personas: [],
    guardrails: { disallowedClaims: [], complianceNotes: "" },
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/brand/context", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(ctxMock).not.toHaveBeenCalled();
  });

  it("returns the assembled context for the current org", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      context: { businessName: "Big Shoulders Restoration", bannedPhrases: ["guarantee"] },
    });
    expect(ctxMock).toHaveBeenCalledWith("org_1");
  });
});
