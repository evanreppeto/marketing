import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org_1") }));
vi.mock("@/lib/knowledge-graph/recall", () => ({ getRecallMemory: vi.fn() }));

import { getRecallMemory } from "@/lib/knowledge-graph/recall";
import { POST } from "./route";

const recallMock = vi.mocked(getRecallMemory);

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
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brain/recall", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { message: "x" }));
    expect(res.status).toBe(401);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("returns ranked memory for the current org", async () => {
    configure();
    const res = await POST(req("Bearer secret", { message: "flood help" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, memory: [{ label: "Trusted fact", kind: "learning" }] });
    expect(recallMock).toHaveBeenCalledWith("org_1", "flood help");
  });

  it("treats a missing message as empty and still returns core memory (200)", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(200);
    expect(recallMock).toHaveBeenCalledWith("org_1", "");
  });
});
