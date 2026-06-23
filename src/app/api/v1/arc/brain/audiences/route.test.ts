import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "ws-1" })),
}));
vi.mock("@/lib/knowledge-graph/audience", () => ({ proposeAudienceSegment: vi.fn() }));

import { proposeAudienceSegment } from "@/lib/knowledge-graph/audience";
import { POST } from "./route";

const proposeMock = vi.mocked(proposeAudienceSegment);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brain/audiences", {
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
  proposeMock.mockReset();
  proposeMock.mockResolvedValue({ ok: true, nodeId: "seg-1", personaLinked: true, evidenceLinked: 2 });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brain/audiences", () => {
  it("401s without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { label: "x" }));
    expect(res.status).toBe(401);
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("proposes an audience for the token-scoped org and returns 201", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", {
        label: "Flood-prone landlords",
        persona: "persona_landlord",
        criteria: "leads with flood loss",
        evidence_node_ids: ["n1", "n2"],
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, id: "seg-1", status: "proposed", personaLinked: true, evidenceLinked: 2 });
    expect(proposeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Flood-prone landlords",
        persona: "persona_landlord",
        criteria: "leads with flood loss",
        evidenceNodeIds: ["n1", "n2"],
      }),
      { orgId: "org-1" },
    );
  });

  it("400s when synthesis is rejected (e.g. missing label)", async () => {
    configure();
    proposeMock.mockResolvedValue({ ok: false, error: "An audience needs a label." });
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
