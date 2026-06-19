import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ getApprovalForApi: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "workspace-1",
  })),
}));

import { getApprovalForApi } from "@/lib/arc-api";

import { GET } from "./route";

const getApprovalMock = vi.mocked(getApprovalForApi);
const params = Promise.resolve({ id: "ap-1" });

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

function request(token = "secret") {
  return new Request("http://localhost/api/v1/arc/approvals/ap-1", {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  getApprovalMock.mockReset();
  getApprovalMock.mockResolvedValue({ id: "ap-1" } as never);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/v1/arc/approvals/:id", () => {
  it("passes the resolved Arc workspace scope into approval detail reads", async () => {
    configure();

    const res = await GET(request(), { params });

    expect(res.status).toBe(200);
    expect(getApprovalMock).toHaveBeenCalledWith(
      "ap-1",
      undefined,
      { orgId: "org-1", workspaceId: "workspace-1" },
    );
  });

  it("returns 404 when the scoped approval is not found", async () => {
    configure();
    getApprovalMock.mockResolvedValue(null);

    const res = await GET(request(), { params });

    expect(res.status).toBe(404);
  });
});
