import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc/orchestrator", () => ({ runArcPartnerCampaign: vi.fn() }));
vi.mock("@/lib/personas/read-model", () => ({ getOrgPersonaKeys: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));

import { runArcPartnerCampaign } from "@/lib/arc/orchestrator";
import { getOrgPersonaKeys } from "@/lib/personas/read-model";

import { POST } from "./route";

const runMock = vi.mocked(runArcPartnerCampaign);
const personasMock = vi.mocked(getOrgPersonaKeys);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/runs", {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RESULT: any = { runId: "r1", status: "needs_approval", campaignId: "camp_1" };

beforeEach(() => {
  runMock.mockReset();
  personasMock.mockReset();
  runMock.mockResolvedValue(RESULT);
  // Default: a non-BSR workspace whose own taxonomy is entirely custom.
  personasMock.mockResolvedValue(["wedding_lead", "corporate_client"]);
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/runs — org-aware persona gate", () => {
  it("401s without a valid token and never runs", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { persona: "wedding_lead" }));
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("accepts a workspace's own custom persona and runs (201)", async () => {
    configure();
    const res = await POST(req("Bearer secret", { persona: "wedding_lead" }));
    expect(res.status).toBe(201);
    expect(runMock).toHaveBeenCalledOnce();
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ persona: "wedding_lead" }),
      undefined,
      undefined,
      { org_id: "org-1", workspace_id: "workspace-1" },
    );
  });

  it("400s a persona that isn't in the workspace's taxonomy, before any write", async () => {
    configure();
    const res = await POST(req("Bearer secret", { persona: "persona_plumbing_partner" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: "rejected" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("skips the gate (accepts) when the workspace has no personas defined", async () => {
    configure();
    personasMock.mockResolvedValue([]);
    const res = await POST(req("Bearer secret", { persona: "anything_goes" }));
    expect(res.status).toBe(201);
    expect(runMock).toHaveBeenCalledOnce();
  });

  it("400s on invalid JSON without running", async () => {
    configure();
    const bad = new Request("http://localhost/api/v1/arc/runs", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });
});
