import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hermes-api", () => ({ claimAgentTask: vi.fn() }));

import { claimAgentTask } from "@/lib/hermes-api";

import { POST } from "./route";

const claimMock = vi.mocked(claimAgentTask);

function claimRequest(authorization?: string) {
  return new Request("http://localhost/api/v1/hermes/tasks/t1/claim", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

const params = Promise.resolve({ id: "t1" });

const env = {
  HERMES_AGENT_API_TOKEN: process.env.HERMES_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configure() {
  process.env.HERMES_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => claimMock.mockReset());

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/hermes/tasks/:id/claim", () => {
  it("returns 401 without a valid token", async () => {
    process.env.HERMES_AGENT_API_TOKEN = "secret";
    const res = await POST(claimRequest("Bearer wrong"), { params });
    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it("claims a queued task (201)", async () => {
    configure();
    claimMock.mockResolvedValue({ ok: true, task: { id: "t1" } as never });
    const res = await POST(claimRequest("Bearer secret"), { params });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("claimed");
    expect(claimMock).toHaveBeenCalledWith("t1");
  });

  it("returns 409 on a conflict", async () => {
    configure();
    claimMock.mockResolvedValue({ ok: false, reason: "conflict", currentStatus: "running" });
    const res = await POST(claimRequest("Bearer secret"), { params });
    expect(res.status).toBe(409);
  });

  it("returns 404 when the task is missing", async () => {
    configure();
    claimMock.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await POST(claimRequest("Bearer secret"), { params });
    expect(res.status).toBe(404);
  });
});
