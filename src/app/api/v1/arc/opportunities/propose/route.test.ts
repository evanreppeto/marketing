import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/opportunities/persistence", () => ({ upsertOpportunities: vi.fn() }));
import { upsertOpportunities } from "@/lib/opportunities/persistence";
import { POST } from "./route";

const mock = vi.mocked(upsertOpportunities);
function req(auth: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/opportunities/propose", {
    method: "POST", headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const valid = { kind: "reengagement", subject_type: "company", subject_id: "co_1", title: "t", summary: "s" };
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ ok: true, count: 1 } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("POST /api/v1/arc/opportunities/propose", () => {
  it("401s without a valid token and never persists", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await POST(req("Bearer wrong", valid))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("persists a valid proposal and returns created count", async () => {
    configure();
    const res = await POST(req("Bearer secret", valid));
    expect(await res.json()).toMatchObject({ ok: true, created: 1 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("returns created:0 when deduped", async () => {
    configure(); mock.mockResolvedValue({ ok: true, count: 0 } as never);
    expect(await (await POST(req("Bearer secret", valid))).json()).toMatchObject({ created: 0 });
  });
  it("400s on an invalid proposal (no persist)", async () => {
    configure();
    expect((await POST(req("Bearer secret", { kind: "x" }))).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it("502s when persistence fails", async () => {
    configure(); mock.mockResolvedValue({ ok: false, error: "boom" } as never);
    expect((await POST(req("Bearer secret", valid))).status).toBe(502);
  });
});
