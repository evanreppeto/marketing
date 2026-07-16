import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/repos", () => ({ listLeads: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));
import { listLeads } from "@/lib/repos";
import { GET } from "./route";

const mock = vi.mocked(listLeads);
function req(query = "") {
  return new Request(`http://localhost/api/v1/arc/crm/leads${query}`, { headers: { authorization: "Bearer secret" } });
}
const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
beforeEach(() => {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  mock.mockReset();
  mock.mockResolvedValue([{ id: "l1", lead_score: 87 }] as never);
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/crm/leads", () => {
  it("applies NO score filter when the caller sends none", async () => {
    // The regression: `Number(null)` is 0 and `Number.isInteger(0)` is true, so an
    // absent max_score became `lead_score <= 0` — which matched nothing and made
    // Arc's lead search return an empty list against a CRM holding 200 leads.
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    const filter = mock.mock.calls[0][0]!;
    expect(filter.maxScore).toBeUndefined();
    expect(filter.minScore).toBeUndefined();
    expect(filter.orgId).toBe("org-1");
  });

  it("still honours explicit score bounds", async () => {
    await GET(req("?min_score=40&max_score=90"));
    expect(mock.mock.calls[0][0]).toMatchObject({ minScore: 40, maxScore: 90 });
  });

  it("treats an explicit max_score=0 as a real filter", async () => {
    // 0 is a legitimate bound when the caller actually asks for it — the bug was
    // inventing it, not honouring it.
    await GET(req("?max_score=0"));
    expect(mock.mock.calls[0][0]).toMatchObject({ maxScore: 0 });
  });

  it("ignores blank and non-integer score params instead of coercing them", async () => {
    await GET(req("?min_score=&max_score=abc"));
    const filter = mock.mock.calls[0][0]!;
    expect(filter.minScore).toBeUndefined();
    expect(filter.maxScore).toBeUndefined();
  });

  it("ignores a non-positive limit but honours a real one", async () => {
    await GET(req());
    expect(mock.mock.calls[0][0]!.limit).toBeUndefined();
    mock.mockClear();
    await GET(req("?limit=25"));
    expect(mock.mock.calls[0][0]).toMatchObject({ limit: 25 });
  });
});
