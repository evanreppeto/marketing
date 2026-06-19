vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { checkAgentBearer } from "@/lib/auth/api-token";

const bearerMock = vi.mocked(checkAgentBearer);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/analyze-website", {
    method: "POST",
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
  vi.restoreAllMocks();
  bearerMock.mockReset();
  bearerMock.mockResolvedValue({
    ok: true,
    tokenSource: "database",
    orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brand/analyze-website", () => {
  it("401s without a valid token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 });
    const res = await POST(req("Bearer wrong", { url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("409s when a database token is not tied to a workspace", async () => {
    configure();
    const fetchSpy = vi.spyOn(global, "fetch");
    bearerMock.mockResolvedValue({ ok: true, tokenSource: "database", orgId: "org-2" });

    const res = await POST(req("Bearer token", { url: "https://acme.com" }));

    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe("workspace_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400s on a missing url", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
  });

  it("400s on a loopback/private url (SSRF guard)", async () => {
    configure();
    const res = await POST(req("Bearer secret", { url: "http://127.0.0.1/" }));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
  });

  it("refuses to follow a redirect to a private host", async () => {
    configure();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    );
    const res = await POST(req("Bearer secret", { url: "https://acme.com" }));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // followed 0 redirects
  });

  it("fetches and returns extracted brand signal", async () => {
    configure();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        "<html><head><title>Acme</title></head><body><h1>We fix leaks</h1></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const res = await POST(req("Bearer secret", { url: "https://acme.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.title).toBe("Acme");
    expect(json.text).toContain("We fix leaks");
  });
});
