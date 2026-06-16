import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * CRM-interaction write tool (act/draft modes only). Append-only annotations on
 * an EXISTING record — a note, a follow-up task, or a timeline activity. The app
 * writes these as author_kind "agent". This is the only direct CRM write Arc has:
 * it never creates or edits core CRM entity rows.
 */
export function interactionWriteTools(client: ArcClient, step: StepFn) {
  const logInteraction = tool(
    "log_interaction",
    "Attach a note, follow-up task, or timeline activity to an existing CRM record. Use to leave a breadcrumb of work done. Does NOT create or edit core records, and never contacts anyone.",
    {
      kind: z.enum(["note", "task", "activity"]),
      entity_type: z.string().describe("CRM entity type, e.g. lead | contact | company | job"),
      entity_id: z.string().describe("The record id to attach to"),
      // note
      body: z.string().optional().describe("Note body (required when kind=note)"),
      is_pinned: z.boolean().optional(),
      is_internal: z.boolean().optional(),
      // task
      title: z.string().optional().describe("Task title (required when kind=task)"),
      description: z.string().optional(),
      due_at: z.string().optional().describe("ISO date"),
      priority: z.string().optional(),
      // activity
      activity_type: z.string().optional().describe("Activity type (required when kind=activity)"),
      summary: z.string().optional().describe("Activity summary (required when kind=activity)"),
      detail: z.string().optional(),
    },
    async (args) =>
      runTool(step, `Logging ${args.kind} on ${args.entity_type}`, async () => {
        const r = await client.apiPost<{ id: string; kind: string }>("/api/v1/arc/crm/interactions", {
          ...args,
          author_name: "Arc",
        });
        return r;
      }),
  );

  return [logInteraction];
}
