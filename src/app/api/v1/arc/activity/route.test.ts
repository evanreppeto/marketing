import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/activity/read-model", () => ({ getRecentActivity: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));
import { getRecentActivity } from "@/lib/activity/read-model";
import { GET } from "./route";

const mock = vi.mocked(getRecentActivity);
function req(auth?: string) { return new Request("http://localhost/api/v1/arc/activity", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ status: "live", entries: [{ id: "e1" }], summary: { total: 1 }, groups: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/activity", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("returns recent activity entries + summary, scoped to the token org", async () => {
    configure();
    expect(await (await GET(req("Bearer secret"))).json()).toMatchObject({ ok: true, entries: [{ id: "e1" }], summary: { total: 1 } });
    // Tenancy: the feed must be scoped to the arcGuard-resolved token org.
    expect(mock).toHaveBeenCalledWith({}, undefined, "org-1");
  });
  it("502s when activity is unavailable", async () => {
    configure(); mock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect((await GET(req("Bearer secret"))).status).toBe(502);
  });
});
