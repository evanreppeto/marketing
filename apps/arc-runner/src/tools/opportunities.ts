import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Write tool (approval-safe): propose a source-backed opportunity into the inbox.
 * Everything lands status=pending; the operator approves before anything happens.
 * Only available in the opportunity-scan tool set.
 */
export function proposeOpportunityTool(client: ArcClient, step: StepFn) {
  return tool(
    "propose_opportunity",
    "Propose a source-backed opportunity into the inbox (status pending — the operator approves it before anything happens). Use during an opportunity scan after reviewing CRM / personas / brand / activity. Give concrete evidence/source refs and a STABLE subject id (CRM id, persona key, competitor id) so duplicates of an existing open opportunity are skipped.",
    {
      kind: z.string().describe("e.g. reengagement, persona_gap, competitor_signal, new_lead"),
      subject_type: z.string().describe("company | contact | lead | persona | competitor | segment"),
      subject_id: z.string().describe("Stable id for the subject — used for dedup"),
      title: z.string(),
      summary: z.string().describe("Why this is an opportunity now"),
      confidence: z.number().min(0).max(100).optional(),
      urgency: z.enum(["low", "medium", "high"]).optional(),
      evidence: z.record(z.string(), z.unknown()).optional().describe("Source links / refs / signals backing it"),
      recommended_action: z.string().optional(),
      recommended_campaign_type: z.string().optional(),
    },
    async (args) =>
      runTool(step, "Proposing opportunity", () =>
        client.apiPost("/api/v1/arc/opportunities/propose", args),
      ),
  );
}
