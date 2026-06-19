import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ listAgentTasks: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    orgSlug: "org",
    orgName: "Org",
    workspaceId: "workspace-1",
    workspaceKey: "default",
    workspaceSlug: "default",
    workspaceName: "Default",
    role: null,
    userId: null,
    source: "default-org",
  })),
}));

import { listAgentTasks } from "@/lib/arc-api";

import { GET } from "./route";

const listAgentTasksMock = vi.mocked(listAgentTasks);

function tasksRequest(authorization: string | undefined, query = "") {
  return new Request(`http://localhost/api/v1/arc/tasks${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configureSupabase() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  listAgentTasksMock.mockReset();
  listAgentTasksMock.mockResolvedValue([]);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/v1/arc/tasks", () => {
  it("returns 503 when no token is configured", async () => {
    delete process.env.ARC_AGENT_API_TOKEN;
    const res = await GET(tasksRequest("Bearer whatever"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
  });

  it("returns 401 on a bad token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(tasksRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("maps the spec status 'pending' to the native 'queued'", async () => {
    configureSupabase();
    const res = await GET(tasksRequest("Bearer secret", "?status=pending"));
    expect(res.status).toBe(200);
    expect(listAgentTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued" }),
      undefined,
      expect.objectContaining({ orgId: "org-1", workspaceId: "workspace-1" }),
    );
  });

  it("accepts the native status 'blocked' directly", async () => {
    configureSupabase();
    await GET(tasksRequest("Bearer secret", "?status=blocked"));
    expect(listAgentTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked" }),
      undefined,
      expect.objectContaining({ orgId: "org-1", workspaceId: "workspace-1" }),
    );
  });

  it("rejects an unknown status with 400", async () => {
    configureSupabase();
    const res = await GET(tasksRequest("Bearer secret", "?status=garbage"));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
    expect(listAgentTasksMock).not.toHaveBeenCalled();
  });
});
