import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_SCOPE = {
  orgId: "org-2",
  workspaceId: "20000000-0000-4000-8000-000000000002",
};

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true,
    tokenSource: "database",
    orgId: TOKEN_SCOPE.orgId,
    workspaceId: TOKEN_SCOPE.workspaceId,
  })),
}));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "10000000-0000-4000-8000-000000000001",
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  appendArcStep: vi.fn(async () => true),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { appendArcStep } from "@/lib/arc-chat/persistence";

import { POST } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);
const appendStepMock = vi.mocked(appendArcStep);

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

function request(body: unknown, token = "secret") {
  return new Request("http://localhost/api/v1/arc/messages/task-1/steps", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bearerMock.mockResolvedValue({
    ok: true,
    tokenSource: "database",
    orgId: TOKEN_SCOPE.orgId,
    workspaceId: TOKEN_SCOPE.workspaceId,
  });
  appendStepMock.mockResolvedValue(true);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/messages/:agentTaskId/steps", () => {
  it("passes the DB-issued Arc workspace scope into step persistence", async () => {
    configure();

    const res = await POST(request({ label: "Checking leads", status: "running" }), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(201);
    expect(appendStepMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentTaskId: "task-1", label: "Checking leads", status: "running" }),
      undefined,
      TOKEN_SCOPE,
    );
  });

  it("rejects invalid bearer tokens before writing", async () => {
    configure();
    bearerMock.mockResolvedValueOnce({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(request({ label: "Checking leads" }, "wrong"), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(401);
    expect(appendStepMock).not.toHaveBeenCalled();
  });
});
