import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ appendAgentRunLog: vi.fn() }));
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

import { appendAgentRunLog } from "@/lib/arc-api";

import { POST } from "./route";

const logMock = vi.mocked(appendAgentRunLog);

function logRequest(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/tasks/t1/log", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "t1" });

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
  logMock.mockReset();
  logMock.mockResolvedValue({ ok: true, logId: "log-1" });
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/tasks/:id/log", () => {
  it("rejects an empty body with 400 and does not write", async () => {
    configure();
    const res = await POST(logRequest("Bearer secret", {}), { params });
    expect(res.status).toBe(400);
    expect(logMock).not.toHaveBeenCalled();
  });

  it("records a log entry (201) via appendAgentRunLog", async () => {
    configure();
    const res = await POST(logRequest("Bearer secret", { message: "made progress" }), { params });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("recorded");
    expect(logMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ message: "made progress" }),
      undefined,
      expect.objectContaining({ orgId: "org-1", workspaceId: "workspace-1" }),
    );
  });

  it("returns 404 when the task is missing", async () => {
    configure();
    logMock.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await POST(logRequest("Bearer secret", { message: "x" }), { params });
    expect(res.status).toBe(404);
  });
});
