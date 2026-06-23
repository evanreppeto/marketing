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

const searchWebWithGemini = vi.hoisted(() => vi.fn());
vi.mock("@/lib/research/gemini-web-search", () => ({
  searchWebWithGemini,
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { POST } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/research/web-search", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_WEB_SEARCH_MODEL: process.env.GEMINI_WEB_SEARCH_MODEL,
};

function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.GEMINI_API_KEY = "gemini-key";
  delete process.env.GEMINI_WEB_SEARCH_MODEL;
}

beforeEach(() => {
  bearerMock.mockReset();
  bearerMock.mockResolvedValue({
    ok: true,
    tokenSource: "database",
    orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  });
  searchWebWithGemini.mockReset();
  searchWebWithGemini.mockResolvedValue({
    model: "gemini-2.5-flash",
    text: "Found lead sources.",
    citations: [{ title: "Example", url: "https://example.com" }],
    searchQueries: ["property managers Chicago"],
  });
});

afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/research/web-search", () => {
  it("401s without a valid Arc token", async () => {
    configure();
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(req("Bearer wrong", { query: "find leads" }));

    expect(res.status).toBe(401);
    expect(searchWebWithGemini).not.toHaveBeenCalled();
  });

  it("503s when Gemini is not configured", async () => {
    configure();
    delete process.env.GEMINI_API_KEY;

    const res = await POST(req("Bearer secret", { query: "find leads" }));

    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
    expect(searchWebWithGemini).not.toHaveBeenCalled();
  });

  it("400s when query is missing", async () => {
    configure();

    const res = await POST(req("Bearer secret", {}));

    expect(res.status).toBe(400);
    expect(searchWebWithGemini).not.toHaveBeenCalled();
  });

  it("returns grounded web research with citations", async () => {
    configure();

    const res = await POST(req("Bearer secret", { query: "find Chicago property manager leads" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      research: {
        text: "Found lead sources.",
        citations: [{ title: "Example", url: "https://example.com" }],
        searchQueries: ["property managers Chicago"],
      },
    });
    expect(searchWebWithGemini).toHaveBeenCalledWith({
      query: "find Chicago property manager leads",
      context: undefined,
      apiKey: "gemini-key",
      model: undefined,
    });
  });
});
