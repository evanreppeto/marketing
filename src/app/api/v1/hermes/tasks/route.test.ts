import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hermes-api", () => ({ listAgentTasks: vi.fn() }));

import { listAgentTasks } from "@/lib/hermes-api";

import { GET } from "./route";

const listAgentTasksMock = vi.mocked(listAgentTasks);

function tasksRequest(authorization: string | undefined, query = "") {
  return new Request(`http://localhost/api/v1/hermes/tasks${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

const env = {
  HERMES_AGENT_API_TOKEN: process.env.HERMES_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configureSupabase() {
  process.env.HERMES_AGENT_API_TOKEN = "secret";
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

describe("GET /api/v1/hermes/tasks", () => {
  it("returns 503 when no token is configured", async () => {
    delete process.env.HERMES_AGENT_API_TOKEN;
    const res = await GET(tasksRequest("Bearer whatever"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
  });

  it("returns 401 on a bad token", async () => {
    process.env.HERMES_AGENT_API_TOKEN = "secret";
    const res = await GET(tasksRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("maps the spec status 'pending' to the native 'queued'", async () => {
    configureSupabase();
    const res = await GET(tasksRequest("Bearer secret", "?status=pending"));
    expect(res.status).toBe(200);
    expect(listAgentTasksMock).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" }));
  });

  it("accepts the native status 'blocked' directly", async () => {
    configureSupabase();
    await GET(tasksRequest("Bearer secret", "?status=blocked"));
    expect(listAgentTasksMock).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });

  it("rejects an unknown status with 400", async () => {
    configureSupabase();
    const res = await GET(tasksRequest("Bearer secret", "?status=garbage"));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
    expect(listAgentTasksMock).not.toHaveBeenCalled();
  });
});
