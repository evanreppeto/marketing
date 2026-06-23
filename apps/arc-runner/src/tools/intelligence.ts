import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only "vision" tools: let Arc see the opportunity inbox, persona
 * intelligence, the vault, the activity timeline, and the uploaded brand
 * documents. Available in every mode; each calls the app's bearer-gated
 * /api/v1/arc/* route. No writes.
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

  const listBrandDocuments = tool(
    "list_brand_documents",
    "List the uploaded brand source documents Arc can use (brand guidelines, voice docs, proof, offerings), with what's been learned from each. Use to see what source material exists before drafting.",
    {},
    async () => runTool(step, "Reading brand documents", () => client.apiGet("/api/v1/arc/brand/sources")),
  );

  const readBrandDocument = tool(
    "read_brand_document",
    "Read one brand document's details + the knowledge extracted from it (including items still pending approval). Use after list_brand_documents to ground copy in a specific source.",
    { id: z.string().describe("The brand document id (from list_brand_documents).") },
    async (args) => runTool(step, "Reading brand document", () => client.apiGet("/api/v1/arc/brand/sources", { id: args.id })),
  );

  const researchWeb = tool(
    "research_web",
    "Run a read-only Gemini web search with citations. Use when Arc needs current outside-app research for lead discovery, local market context, competitor signals, source-backed opportunities, or campaign research. Do not treat results as verified CRM records until the operator reviews them.",
    {
      query: z.string().describe("The web research question to answer."),
      context: z.string().optional().describe("Optional business or campaign context to focus the search."),
    },
    async (args) =>
      runTool(step, "Researching web", () =>
        client.apiPost("/api/v1/arc/research/web-search", {
          query: args.query,
          context: args.context,
        }),
      ),
  );

  return [
    listOpportunities,
    readPersonaIntelligence,
    listVaultNotes,
    getVaultNote,
    readRecentActivity,
    listBrandDocuments,
    readBrandDocument,
    researchWeb,
  ];
}
