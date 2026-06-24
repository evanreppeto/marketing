vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true, tokenSource: "database", orgId: "org-2", workspaceId: "20000000-0000-4000-8000-000000000002",
  })),
}));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1", workspaceId: "10000000-0000-4000-8000-000000000001", workspaceKey: "default", role: "admin",
  })),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { checkAgentBearer } from "@/lib/auth/api-token";

const bearerMock = vi.mocked(checkAgentBearer);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/design", {
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
  bearerMock.mockResolvedValue({ ok: true, tokenSource: "database", orgId: "org-2", workspaceId: "20000000-0000-4000-8000-000000000002" });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brand/design", () => {
  it("401s without a valid token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 });
    const res = await POST(req("Bearer wrong", { url: "https://example.com" }));
    expect(res.status).toBe(401);
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

  it("returns the extracted design proposal", async () => {
    configure();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        `<head><meta name="theme-color" content="#1B2A4A"><link rel="apple-touch-icon" href="/touch.png"><style>:root{--brand-primary:#C8A24B} h1{font-family:Oswald,sans-serif} body{font-family:Inter,Arial}</style></head>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const res = await POST(req("Bearer secret", { url: "https://acme.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.logoUrl).toBe("https://acme.com/touch.png");
    expect(json.palette.primary).toBe("#c8a24b");
    expect(json.headingFont).toBe("Oswald");
    expect(json.sourceUrl).toBe("https://acme.com/");
  });
});
