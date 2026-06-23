import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org_1",
    orgSlug: "big-shoulders-restoration",
    orgName: "Big Shoulders Restoration",
    workspaceId: "workspace_1",
    workspaceKey: "default",
    workspaceSlug: "default",
    workspaceName: "Default",
    role: null,
    userId: null,
    source: "default-org",
  })),
}));
vi.mock("@/lib/brand-kit/persistence", () => ({
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));

import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { NEUTRAL_DEFAULTS } from "@/domain";
import { PUT } from "./route";

const getMock = vi.mocked(getBusinessProfile);
const upsertMock = vi.mocked(upsertBusinessProfile);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/profile", {
    method: "PUT",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  getMock.mockReset();
  upsertMock.mockReset();
  getMock.mockResolvedValue(null);
  upsertMock.mockImplementation(async (_org, profile) => profile);
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("PUT /api/v1/arc/brand/profile", () => {
  it("401s without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await PUT(req("Bearer wrong", { displayName: "Acme" }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("writes a draft profile from proposed fields (forces status=draft)", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { displayName: "Acme Co", services: ["repairs"], status: "active" }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({ displayName: "Acme Co", services: ["repairs"], status: "draft" }),
    );
  });

  it("refuses to overwrite an ACTIVE profile", async () => {
    configure();
    getMock.mockResolvedValue({ ...NEUTRAL_DEFAULTS, displayName: "Live Co", status: "active" });
    const res = await PUT(req("Bearer secret", { displayName: "Hijack" }));
    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe("locked");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400s when the merged profile fails validation (empty displayName)", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { tagline: "no name given" }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns saved profile values in the response body (propagation guard)", async () => {
    configure();
    getMock.mockResolvedValue({
      ...NEUTRAL_DEFAULTS,
      displayName: "Restored Co",
      tone: "authoritative",
      voiceGuidance: "Use plain English.",
      status: "draft",
    });
    upsertMock.mockImplementation(async (_org, profile) => profile);

    const res = await PUT(
      req("Bearer secret", {
        displayName: "Restored Co",
        tone: "warm",
        voiceGuidance: "Speak like a trusted neighbor.",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profile.displayName).toBe("Restored Co");
    expect(body.profile.tone).toBe("warm");
    expect(body.profile.voiceGuidance).toBe("Speak like a trusted neighbor.");
    expect(body.profile.status).toBe("draft");
  });
});
