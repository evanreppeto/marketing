import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true,
    tokenSource: "database",
    orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  })),
}));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "10000000-0000-4000-8000-000000000001",
    workspaceKey: "default",
    role: "admin",
  })),
}));
vi.mock("@/lib/performance/slice-read-model", () => ({
  getPerformanceBySlice: vi.fn(async (f: { dimension?: string; orgId?: string }) => ({
    dimension: f.dimension ?? "persona",
    slices: [{ key: "persona_landlord", jobs: 4, roas: 4, leads: 10, sampleSize: 2 }],
  })),
}));
import { checkAgentBearer } from "@/lib/auth/api-token";
import { getPerformanceBySlice } from "@/lib/performance/slice-read-model";

import { GET } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);

function req(authorization: string | undefined, query = "") {
  return new Request(`http://localhost/api/v1/arc/performance${query}`, {
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
  bearerMock.mockReset();
  bearerMock.mockResolvedValue({
    ok: true,
    tokenSource: "database",
    orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  });
  vi.mocked(getPerformanceBySlice).mockClear();
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/performance", () => {
  it("401 without a valid token, no read", async () => {
    configure();
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 });
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(getPerformanceBySlice).not.toHaveBeenCalled();
  });

  it("200 with default dimension when no param", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      dimension: "persona",
      slices: [{ key: "persona_landlord", jobs: 4 }],
    });
  });

  it("honors dimension + persona filter params", async () => {
    configure();
    const res = await GET(req("Bearer secret", "?dimension=channel&persona=persona_landlord"));
    expect(res.status).toBe(200);
    expect(getPerformanceBySlice).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: "channel", persona: "persona_landlord", orgId: "org-2" }),
    );
    const json = await res.json();
    expect(json.dimension).toBe("channel");
  });
});
