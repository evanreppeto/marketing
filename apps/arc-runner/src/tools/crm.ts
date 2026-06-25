import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only CRM tools. Each maps to a GET /api/v1/arc/crm/* endpoint and reports
 * a running -> done step. All filters optional; results are real CRM rows.
 */
export function crmReadTools(client: ArcClient, step: StepFn) {
  const searchCompanies = tool(
    "search_companies",
    "Search CRM companies (accounts/partners). Filters optional. Use for partner/account questions.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      partner_tier: z.string().optional(),
      q: z.string().optional().describe("Free-text search"),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM companies", async () => {
        const r = await client.apiGet<{ companies: unknown[] }>("/api/v1/arc/crm/companies", args);
        return r.companies ?? [];
      }),
  );

  const searchContacts = tool(
    "search_contacts",
    "Search CRM contacts (people). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM contacts", async () => {
        const r = await client.apiGet<{ contacts: unknown[] }>("/api/v1/arc/crm/contacts", args);
        return r.contacts ?? [];
      }),
  );

  const searchLeads = tool(
    "search_leads",
    "Search CRM leads/opportunities. Use when the operator asks about leads, opportunities, or who to target. Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      source: z.string().optional(),
      q: z.string().optional(),
      min_score: z.number().optional(),
      max_score: z.number().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM leads", async () => {
        const r = await client.apiGet<{ leads: unknown[] }>("/api/v1/arc/crm/leads", args);
        return r.leads ?? [];
      }),
  );

  const getLead = tool(
    "get_lead",
    "Fetch a single CRM lead by id, with full detail.",
    { id: z.string().describe("The lead id") },
    async (args) =>
      runTool(step, "Loading lead", async () => {
        const r = await client.apiGet<{ lead: unknown }>(`/api/v1/arc/crm/leads/${args.id}`);
        return r.lead ?? null;
      }),
  );

  const searchJobs = tool(
    "search_jobs",
    "Search CRM jobs (restoration jobs/projects). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM jobs", async () => {
        const r = await client.apiGet<{ jobs: unknown[] }>("/api/v1/arc/crm/jobs", args);
        return r.jobs ?? [];
      }),
  );

  const searchOutcomes = tool(
    "search_outcomes",
    "Search CRM outcomes (closed results / attribution). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM outcomes", async () => {
        const r = await client.apiGet<{ outcomes: unknown[] }>("/api/v1/arc/crm/outcomes", args);
        return r.outcomes ?? [];
      }),
  );

  const searchProperties = tool(
    "search_properties",
    "Search CRM properties (locations/sites). Filters optional.",
    {
      persona: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      property_type: z.string().optional(),
      company_id: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM properties", async () => {
        const r = await client.apiGet<{ properties: unknown[] }>("/api/v1/arc/crm/properties", args);
        return r.properties ?? [];
      }),
  );

  const searchCrm = tool(
    "search_crm",
    "Search existing CRM records (companies, contacts, leads) by name, email, phone, or domain BEFORE creating anything. Always call this first when you might add a lead/company/contact, and prefer update_record on a match instead of create_lead.",
    {
      q: z.string().describe("Name, email, phone, or domain to look up (min 2 chars)"),
      type: z.enum(["all", "company", "contact", "lead"]).optional(),
    },
    async (args) =>
      runTool(step, `Searching CRM for ${args.q}`, async () =>
        client.apiGet(`/api/v1/arc/crm/search`, { q: args.q, type: args.type }),
      ),
  );

  return [searchCompanies, searchContacts, searchLeads, getLead, searchJobs, searchOutcomes, searchProperties, searchCrm];
}
