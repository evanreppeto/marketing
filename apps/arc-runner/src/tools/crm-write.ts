import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * CRM core-record write tool (act/draft modes only). Creates a lead from web
 * research — a company, its contact(s), and a leads-pipeline row — or enriches
 * blank fields on records that already match. Writes live, tagged
 * source="arc_research". Only ever pass fields found in a real source; never
 * invent an email or phone. Does not contact anyone.
 */
export function crmWriteTools(client: ArcClient, step: StepFn) {
  const createLeadFromResearch = tool(
    "create_lead_from_research",
    "Create a CRM lead from web research: a company, its contact(s), and a leads-pipeline row. Re-uses an existing company/contact when one matches, filling only blank fields. Only pass fields you found in a real source — never invent an email or phone. Writes live (no approval needed for CRM records) and tags everything source=arc_research. Does not contact anyone.",
    {
      persona: z
        .string()
        .describe("Best-fit persona key for this lead, e.g. persona_plumbing_partner. Must be one of the org's personas."),
      company: z
        .object({
          name: z.string(),
          website_url: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
        })
        .describe("The business. Only include website/phone/email you found in a real source — omit, don't guess."),
      contacts: z
        .array(
          z.object({
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            title: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
          }),
        )
        .min(1)
        .describe("People at the company. Include title/email/phone only when found in a real source — never invent them; leave a field out if unknown."),
      property: z
        .object({
          street_line_1: z.string(),
          street_line_2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          postal_code: z.string(),
          property_type: z.string().optional(),
        })
        .optional(),
      evidence: z
        .array(z.object({ url: z.string(), note: z.string().optional() }))
        .min(1)
        .describe("The sources you actually read. Required — never create a lead you can't cite."),
      confidence: z.number().min(0).max(1).optional(),
      existing_company_id: z.string().optional().describe("Set to enrich a company you already found via search_companies."),
      existing_contact_id: z.string().optional().describe("Set to enrich a contact you already found via search_contacts."),
    },
    async (args) =>
      runTool(step, `Creating lead from research: ${args.company.name}`, async () => {
        return client.apiPost<{
          companyId: string | null;
          contactIds: string[];
          leadId: string;
          enriched: boolean;
        }>("/api/v1/arc/crm/leads", { ...args, author_name: "Arc" });
      }),
  );

  return [createLeadFromResearch];
}
