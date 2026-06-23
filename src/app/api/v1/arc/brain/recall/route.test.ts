import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Recall must resolve the org the SAME way every other brain route does: through
// arcGuard, which for a database-issued agent token reads the org straight off the
// token. The old code used getCurrentOrgId(), which (for a cookieless runner call)
// falls back to getCurrentWorkspaceContext()'s DEFAULT org — so Arc recalled the
// wrong/empty brain for any non-default workspace. These mocks pull the token org
// and the workspace-context org apart so a regression to the old path fails loudly.
vi.mock("@/lib/auth/api-token", () => ({ checkAgentBearer: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org_default_fallback", workspaceId: "ws_default" })),
}));
vi.mock("@/lib/knowledge-graph/recall", () => ({ getRecallMemory: vi.fn() }));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { getRecallMemory } from "@/lib/knowledge-graph/recall";
import { POST } from "./route";

const recallMock = vi.mocked(getRecallMemory);
const bearerMock = vi.mocked(checkAgentBearer);

const TOKEN_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brain/recall", {
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
  recallMock.mockReset();
  recallMock.mockResolvedValue([{ label: "Trusted fact", summary: null, kind: "learning" }]);
  bearerMock.mockReset();
  // Default: a valid database-issued token scoped to its own org/workspace.
  bearerMock.mockResolvedValue({
    ok: true,
    tokenSource: "database",
    orgId: "org_token",
    workspaceId: TOKEN_WORKSPACE_ID,
  } as Awaited<ReturnType<typeof checkAgentBearer>>);
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brain/recall", () => {
  it("401s without a valid token and never reads", async () => {
    configure();
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 } as Awaited<
      ReturnType<typeof checkAgentBearer>
    >);
    const res = await POST(req("Bearer wrong", { message: "x" }));
    expect(res.status).toBe(401);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("recalls memory for the token-scoped org, NOT the default-org fallback", async () => {
    configure();
    const res = await POST(req("Bearer secret", { message: "flood help" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, memory: [{ label: "Trusted fact", kind: "learning" }] });
    // The bug fix: org comes from the token, not getCurrentWorkspaceContext()'s default.
    expect(recallMock).toHaveBeenCalledWith("org_token", "flood help");
  });

  it("treats a missing message as empty and still returns core memory (200)", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(200);
    expect(recallMock).toHaveBeenCalledWith("org_token", "");
  });
});
