import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/v1/arc/_lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/v1/arc/_lib/http")>();
  return { ...actual, arcGuard: vi.fn() };
});
vi.mock("@/lib/lead-research/persistence", () => ({ persistLeadResearch: vi.fn() }));

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { persistLeadResearch } from "@/lib/lead-research/persistence";

import { POST } from "./route";

function post(body: unknown) {
  return new Request("http://localhost/api/v1/arc/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing" },
  contacts: [{ email: "dana@acme.example" }],
  evidence: [{ url: "https://acme.example" }],
};

describe("POST /api/v1/arc/crm/leads", () => {
  it("persists and returns 201 with the new ids", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    vi.mocked(persistLeadResearch).mockResolvedValue({
      ok: true,
      companyId: "company-1",
      contactIds: ["contact-1"],
      leadId: "lead-1",
      enriched: false,
    });

    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, leadId: "lead-1", companyId: "company-1", enriched: false });
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    const res = await POST(post({ ...validBody, persona: "unassigned_persona" }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when persistence fails", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    vi.mocked(persistLeadResearch).mockResolvedValue({ ok: false, error: "db down" });
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
  });
});
