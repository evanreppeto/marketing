import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ listApprovalsForApi: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "workspace-1",
  })),
}));

import { listApprovalsForApi } from "@/lib/arc-api";

import { GET } from "./route";

const listApprovalsMock = vi.mocked(listApprovalsForApi);

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

function request(url = "http://localhost/api/v1/arc/approvals?status=pending_approval&limit=20", token = "secret") {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  listApprovalsMock.mockReset();
  listApprovalsMock.mockResolvedValue([]);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/v1/arc/approvals", () => {
  it("passes the resolved Arc workspace scope into approval reads", async () => {
    configure();

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(listApprovalsMock).toHaveBeenCalledWith(
      { statuses: ["pending_approval"], limit: 20 },
      undefined,
      { orgId: "org-1", workspaceId: "workspace-1" },
    );
  });

  it("rejects invalid bearer tokens before reading", async () => {
    configure();

    const res = await GET(request("http://localhost/api/v1/arc/approvals", "wrong"));

    expect(res.status).toBe(401);
    expect(listApprovalsMock).not.toHaveBeenCalled();
  });
});
