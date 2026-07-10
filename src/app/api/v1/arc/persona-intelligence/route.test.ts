import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/persona-intelligence/read-model", () => ({ getPersonaIntelligenceData: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { GET } from "./route";

const mock = vi.mocked(getPersonaIntelligenceData);
function req(auth?: string) { return new Request("http://localhost/api/v1/arc/persona-intelligence", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ snapshots: [], knowledge: [], guardrails: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/persona-intelligence", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("returns the persona-intelligence payload scoped to the token's org", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, personaIntelligence: { snapshots: [] } });
    expect(mock).toHaveBeenCalledWith("org-1");
  });
  it("502s when the read-model is unavailable", async () => {
    configure();
    mock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect((await GET(req("Bearer secret"))).status).toBe(502);
  });
});
