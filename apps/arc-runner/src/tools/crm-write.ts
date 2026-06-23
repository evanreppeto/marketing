import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Core CRM write tools (act/draft modes only). Arc can CREATE new lead bundles
 * and UPDATE existing records. Records are stamped origin=agent; updates are
 * logged to the timeline. Nothing here is outbound — a CRM record reaches no one.
 */
export function crmWriteTools(client: ArcClient, step: StepFn) {
  const createLead = tool(
    "create_lead",
    "Create a NEW lead in the CRM (company + contact + property + lead). Use when the operator asks you to add/populate a lead, or when you've found a prospect to record. Persona must be one of the official persona keys. Dedups against existing companies/contacts. The lead is internal and reaches no one. After it succeeds, emit a result card linking to the new lead.",
    {
      persona: z.string().describe("Official persona key, e.g. persona_plumbing_partner"),
      source: z.string().describe("Where this lead came from, e.g. arc_manual or arc_discovery"),
      company_name: z.string().optional(),
      partner_tier: z.enum(["A", "B", "C"]).optional(),
      contact_first_name: z.string().optional(),
      contact_last_name: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      street_line_1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional().describe("2-letter state code"),
      postal_code: z.string().optional(),
      loss_summary: z.string().optional(),
      review_status: z.enum(["active", "proposed"]).optional().describe("active (operator asked) or proposed (your own discovery)"),
      agent_confidence: z.number().optional().describe("0-1 self-rated confidence"),
    },
    async (args) =>
      runTool(step, `Creating lead${args.company_name ? ` for ${args.company_name}` : ""}`, async () => {
        const lead: Record<string, unknown> = {
          persona: args.persona,
          source: args.source,
          ...(args.company_name ? { company: { name: args.company_name, partnerTier: args.partner_tier } } : {}),
          ...(args.contact_first_name || args.contact_last_name || args.contact_email || args.contact_phone
            ? {
                contact: {
                  firstName: args.contact_first_name,
                  lastName: args.contact_last_name,
                  email: args.contact_email,
                  phone: args.contact_phone,
                },
              }
            : {}),
          ...(args.street_line_1 && args.city && args.state && args.postal_code
            ? {
                property: {
                  streetLine1: args.street_line_1,
                  city: args.city,
                  state: args.state,
                  postalCode: args.postal_code,
                },
              }
            : {}),
          ...(args.loss_summary ? { lossSummary: args.loss_summary } : {}),
        };
        return client.apiPost("/api/v1/arc/crm/leads", {
          lead,
          review_status: args.review_status ?? "active",
          agent_confidence: args.agent_confidence,
        });
      }),
  );

  const updateRecord = tool(
    "update_record",
    "Update fields on an EXISTING lead, company, or contact (e.g. fix a persona, set a status, correct contact info). Only whitelisted fields apply; the change is logged to the record timeline. Never deletes. Internal only.",
    {
      table: z.enum(["leads", "companies", "contacts"]),
      id: z.string().describe("The record id to update"),
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .describe("Column -> value map; non-whitelisted keys are ignored"),
      summary: z.string().optional().describe("Short why-note for the timeline"),
    },
    async (args) =>
      runTool(step, `Updating ${args.table} ${args.id}`, async () =>
        client.apiPost("/api/v1/arc/crm/records/update", {
          table: args.table,
          id: args.id,
          fields: args.fields,
          summary: args.summary,
        }),
      ),
  );

  return [createLead, updateRecord];
}
