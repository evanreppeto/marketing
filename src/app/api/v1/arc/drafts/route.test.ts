import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/arc-api", () => ({ createApprovalDraft: vi.fn() }));

import { createApprovalDraft } from "@/lib/arc-api";

import { POST } from "./route";

const createDraftMock = vi.mocked(createApprovalDraft);

function draftRequest(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/drafts", {
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
  createDraftMock.mockReset();
  createDraftMock.mockResolvedValue({ ok: true, approvalItemId: "ap-1", agentOutputId: null });
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/drafts", () => {
  it("returns 401 without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(draftRequest("Bearer wrong", { item_type: "x", draft: "y" }));
    expect(res.status).toBe(401);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("rejects a missing item_type or draft with 400", async () => {
    configure();
    expect((await POST(draftRequest("Bearer secret", { draft: "y" }))).status).toBe(400);
    expect((await POST(draftRequest("Bearer secret", { item_type: "x" }))).status).toBe(400);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("creates a draft (201)", async () => {
    configure();
    const res = await POST(draftRequest("Bearer secret", { item_type: "partner_outreach", draft: "copy" }));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("drafted");
    expect(createDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "partner_outreach", draft: "copy" }),
    );
  });
});
