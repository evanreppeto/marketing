import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/brand-knowledge/sources-read-model", () => ({ listBrandSources: vi.fn(), getBrandSource: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));
import { listBrandSources, getBrandSource } from "@/lib/brand-knowledge/sources-read-model";
import { GET } from "./route";

const listMock = vi.mocked(listBrandSources);
const getMock = vi.mocked(getBrandSource);
function req(auth: string | undefined, id?: string) {
  const u = new URL("http://localhost/api/v1/arc/brand/sources"); if (id) u.searchParams.set("id", id);
  return new Request(u, { headers: { ...(auth ? { authorization: auth } : {}) } });
}
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { listMock.mockReset(); getMock.mockReset(); listMock.mockResolvedValue([{ id: "a1", fileName: "Guide.pdf" }] as never); getMock.mockResolvedValue({ id: "a1", fileName: "Guide.pdf", nodes: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/brand/sources", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });
  it("lists brand documents scoped to the token org", async () => {
    configure();
    expect(await (await GET(req("Bearer secret"))).json()).toMatchObject({ ok: true, documents: [{ id: "a1" }] });
    expect(listMock).toHaveBeenCalledWith("org-1");
  });
  it("returns one document for ?id= scoped to the token org", async () => {
    configure();
    const res = await GET(req("Bearer secret", "a1"));
    expect(await res.json()).toMatchObject({ ok: true, document: { id: "a1" } });
    expect(getMock).toHaveBeenCalledWith("a1", "org-1");
  });
  it("404s when the id is not an Arc-available brand source", async () => {
    configure(); getMock.mockResolvedValue(null as never);
    expect((await GET(req("Bearer secret", "missing"))).status).toBe(404);
  });
});
