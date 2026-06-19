import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only "vision" tools: let Arc see the opportunity inbox, persona
 * intelligence, the vault, and the activity timeline. Available in every mode;
 * each calls the app's bearer-gated /api/v1/arc/* route. No writes.
 */
export function intelligenceTools(client: ArcClient, step: StepFn) {
  const listOpportunities = tool(
    "list_opportunities",
    "List the open opportunity inbox (source-backed opportunities Arc could act on: pending / drafting / drafted). Use to survey or triage what's waiting before drafting.",
    {},
    async () => runTool(step, "Reading opportunities", () => client.apiGet("/api/v1/arc/opportunities")),
  );

  const readPersonaIntelligence = tool(
    "read_persona_intelligence",
    "Read the Persona Revenue Intelligence overview — persona segments, scores, signals, and persisted knowledge. Use when reasoning about which persona to target or how a segment is trending.",
    {},
    async () => runTool(step, "Reading persona intelligence", () => client.apiGet("/api/v1/arc/persona-intelligence")),
  );

  const listVaultNotes = tool(
    "list_vault_notes",
    "List the vault notes (the operator's Obsidian-style knowledge base). Use to find relevant notes; then get_vault_note for the full text of one.",
    {},
    async () => runTool(step, "Reading vault notes", () => client.apiGet("/api/v1/arc/vault")),
  );

  const getVaultNote = tool(
    "get_vault_note",
    "Read one vault note in full by its slug (from list_vault_notes).",
    { slug: z.string().describe("The note slug.") },
    async (args) => runTool(step, "Reading vault note", () => client.apiGet("/api/v1/arc/vault", { slug: args.slug })),
  );

  const readRecentActivity = tool(
    "read_recent_activity",
    "Read the recent cross-system activity timeline (what's happened across CRM, campaigns, approvals). Use for situational awareness — what changed lately.",
    {},
    async () => runTool(step, "Reading activity", () => client.apiGet("/api/v1/arc/activity")),
  );

  return [listOpportunities, readPersonaIntelligence, listVaultNotes, getVaultNote, readRecentActivity];
}
