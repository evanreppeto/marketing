import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "workspace-1",
  })),
}));
vi.mock("@/lib/repos", () => ({
  listCompanies: vi.fn(async () => []),
  listContacts: vi.fn(async () => []),
  listLeads: vi.fn(async () => []),
  listJobs: vi.fn(async () => []),
  listProperties: vi.fn(async () => []),
  listOutcomes: vi.fn(async () => []),
}));

import {
  listCompanies,
  listContacts,
  listJobs,
  listLeads,
  listOutcomes,
  listProperties,
} from "@/lib/repos";

import { GET as getCompanies } from "./companies/route";
import { GET as getContacts } from "./contacts/route";
import { GET as getJobs } from "./jobs/route";
import { GET as getLeads } from "./leads/route";
import { GET as getOutcomes } from "./outcomes/route";
import { GET as getProperties } from "./properties/route";

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

function request(path: string, token = "secret") {
  return new Request(`http://localhost/api/v1/arc/crm/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.mocked(listCompanies).mockClear();
  vi.mocked(listContacts).mockClear();
  vi.mocked(listLeads).mockClear();
  vi.mocked(listJobs).mockClear();
  vi.mocked(listProperties).mockClear();
  vi.mocked(listOutcomes).mockClear();
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Arc CRM routes", () => {
  it("passes the resolved org scope into all CRM list filters", async () => {
    configure();

    await getCompanies(request("companies?status=active&persona=persona_homeowner_emergency&partner_tier=A&q=lake&limit=10"));
    await getContacts(request("contacts?status=active&persona=persona_homeowner_emergency&company_id=company-1&q=evan&limit=10"));
    await getLeads(request("leads?status=qualified&persona=persona_homeowner_emergency&source=web&q=water&min_score=25&max_score=90&limit=10"));
    await getJobs(request("jobs?status=scheduled&persona=persona_homeowner_emergency&company_id=company-1&limit=10"));
    await getProperties(request("properties?persona=persona_homeowner_emergency&city=Chicago&state=IL&postal_code=60614&property_type=condo&company_id=company-1&q=main&limit=10"));
    await getOutcomes(request("outcomes?status=won&persona=persona_homeowner_emergency&company_id=company-1&limit=10"));

    expect(listCompanies).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
    expect(listContacts).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
    expect(listLeads).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
    expect(listJobs).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
    expect(listProperties).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
    expect(listOutcomes).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1" }));
  });

  it("rejects invalid bearer tokens before reading CRM data", async () => {
    configure();

    const res = await getCompanies(request("companies", "wrong"));

    expect(res.status).toBe(401);
    expect(listCompanies).not.toHaveBeenCalled();
  });
});
