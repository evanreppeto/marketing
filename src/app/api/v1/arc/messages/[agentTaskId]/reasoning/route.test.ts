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
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  streamArcMessageReasoning: vi.fn(async () => undefined),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { streamArcMessageReasoning } from "@/lib/arc-chat/persistence";

import { POST } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);
const streamMock = vi.mocked(streamArcMessageReasoning);

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
  return new Request("http://localhost/api/v1/arc/messages/task-1/reasoning", {
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
  streamMock.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/messages/:agentTaskId/reasoning", () => {
  it("streams the partial reasoning into the pending bubble", async () => {
    configure();

    const res = await POST(request({ reasoning: "Weighing hail exposure vs. roof age…" }), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(200);
    expect(streamMock).toHaveBeenCalledWith({
      agentTaskId: "task-1",
      reasoning: "Weighing hail exposure vs. roof age…",
    });
  });

  it("accepts an empty string (reasoning can be empty early on)", async () => {
    configure();

    const res = await POST(request({ reasoning: "" }), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(200);
    expect(streamMock).toHaveBeenCalledWith({ agentTaskId: "task-1", reasoning: "" });
  });

  it("rejects a non-string reasoning payload before writing", async () => {
    configure();

    const res = await POST(request({ reasoning: 42 }), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(400);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens before writing", async () => {
    configure();
    bearerMock.mockResolvedValueOnce({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(request({ reasoning: "hi" }, "wrong"), {
      params: Promise.resolve({ agentTaskId: "task-1" }),
    });

    expect(res.status).toBe(401);
    expect(streamMock).not.toHaveBeenCalled();
  });
});
