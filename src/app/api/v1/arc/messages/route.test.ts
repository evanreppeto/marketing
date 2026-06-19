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
vi.mock("@/lib/arc-chat/inbox", () => ({
  claimChatTask: vi.fn(async () => true),
  listQueuedChatTasks: vi.fn(async () => [
    {
      agentTaskId: "task-1",
      conversationId: "conv-1",
      message: "Draft a reply",
      mentions: [],
      operator: "Operator",
      createdAt: "2026-06-19T12:00:00.000Z",
    },
  ]),
  reclaimStaleChatTasks: vi.fn(async () => []),
  settleChatTask: vi.fn(async () => undefined),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  completeArcMessage: vi.fn(async () => undefined),
  failArcMessage: vi.fn(async () => undefined),
  findPendingMessageByTask: vi.fn(async () => ({
    id: "msg-1",
    conversationId: "conv-1",
  })),
  touchConversation: vi.fn(async () => undefined),
}));
vi.mock("@/lib/arc-chat/status-log", () => ({ logArcChatStatus: vi.fn() }));
vi.mock("@/lib/settings/agent-name", () => ({ getAgentName: vi.fn(async () => "Arc") }));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { claimChatTask, listQueuedChatTasks, reclaimStaleChatTasks, settleChatTask } from "@/lib/arc-chat/inbox";
import { completeArcMessage, findPendingMessageByTask } from "@/lib/arc-chat/persistence";

import { GET, POST } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);

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

function getRequest(token = "secret") {
  return new Request("http://localhost/api/v1/arc/messages?limit=5", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function postRequest(body: unknown, token = "secret") {
  return new Request("http://localhost/api/v1/arc/messages", {
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
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/v1/arc/messages", () => {
  it("passes the DB-issued Arc workspace scope into inbox list, claim, and reclaim", async () => {
    configure();

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    expect(listQueuedChatTasks).toHaveBeenCalledWith(5, undefined, TOKEN_SCOPE);
    expect(claimChatTask).toHaveBeenCalledWith("task-1", undefined, TOKEN_SCOPE);
    expect(reclaimStaleChatTasks).toHaveBeenCalledWith({ limit: 4, agentName: "Arc" }, undefined, TOKEN_SCOPE);
  });

  it("rejects invalid bearer tokens before reading", async () => {
    configure();
    bearerMock.mockResolvedValueOnce({ ok: false, reason: "unauthorized", status: 401 });

    const res = await GET(getRequest("wrong"));

    expect(res.status).toBe(401);
    expect(listQueuedChatTasks).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/arc/messages", () => {
  it("settles the replied task inside the DB-issued Arc workspace", async () => {
    configure();

    const res = await POST(postRequest({ agentTaskId: "task-1", body: "Done." }));

    expect(res.status).toBe(201);
    expect(findPendingMessageByTask).toHaveBeenCalledWith("task-1", undefined, TOKEN_SCOPE);
    expect(completeArcMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: "msg-1", body: "Done." }));
    expect(settleChatTask).toHaveBeenCalledWith("task-1", "completed", undefined, TOKEN_SCOPE);
  });
});
