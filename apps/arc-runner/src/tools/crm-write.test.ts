import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { crmWriteTools } from "./crm-write";

const noStep = async () => {};
type HandlerResult = { content: Array<{ type: string; text: string }> };

function byName(client: ArcClient) {
  return Object.fromEntries(crmWriteTools(client, noStep).map((t) => [t.name, t]));
}
function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("crmWriteTools", () => {
  it("create_lead_from_research posts the payload to the leads route", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, leadId: "lead-1", companyId: "company-1", contactIds: ["contact-1"], enriched: false })),
    } as unknown as ArcClient;
    const tools = byName(client);
    const args = {
      persona: "persona_plumbing_partner",
      company: { name: "Acme Plumbing" },
      contacts: [{ email: "dana@acme.example" }],
      evidence: [{ url: "https://acme.example" }],
    };
    const res = await callHandler(tools["create_lead_from_research"], args);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/crm/leads", { ...args, author_name: "Arc" });
    expect(res.content[0].text).toContain("lead-1");
  });

  it("forwards existing_company_id / existing_contact_id for the enrich path", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, leadId: "lead-2", companyId: "company-9", contactIds: ["contact-9"], enriched: true })),
    } as unknown as ArcClient;
    const tools = byName(client);
    const args = {
      persona: "persona_plumbing_partner",
      company: { name: "Acme Plumbing" },
      contacts: [{ email: "dana@acme.example" }],
      evidence: [{ url: "https://acme.example" }],
      existing_company_id: "company-9",
      existing_contact_id: "contact-9",
    };
    await callHandler(tools["create_lead_from_research"], args);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/crm/leads", { ...args, author_name: "Arc" });
  });

  it("exposes exactly the one write tool", () => {
    const names = crmWriteTools({} as ArcClient, noStep).map((t) => t.name);
    expect(names).toEqual(["create_lead_from_research"]);
  });
});
