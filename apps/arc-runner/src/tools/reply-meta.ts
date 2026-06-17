import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcMention } from "../types";
import { textResult } from "./helpers";

/** Propose 1–4 follow-up prompts; the app renders them as clickable chips. */
export function suggestFollowupsTool(addSuggestion: (text: string) => void) {
  return tool(
    "suggest_followups",
    "Offer 1–4 short, concrete next-step prompts the operator can tap to continue (e.g. 'Draft an SMS variant', 'Find more flood-zone landlords'). Call once near the end of your reply.",
    { prompts: z.array(z.string()).describe("1–4 short next-step prompts") },
    async (args) => {
      const kept = args.prompts.map((p) => p.trim()).filter(Boolean).slice(0, 4);
      for (const p of kept) addSuggestion(p);
      return textResult(`Suggested ${kept.length} follow-up(s).`);
    },
  );
}

/** Record the CRM/brain/campaign records you used; they render as "Sources Arc used". */
export function citeSourcesTool(addSource: (mention: ArcMention) => void) {
  return tool(
    "cite_sources",
    "Cite the records you used to answer (leads, companies, contacts, campaigns, etc.) so the operator sees your sources. Provide each as { type, id, label, href } using the record's real id and a link like /crm/leads/<id> or /campaigns/<id>.",
    {
      sources: z
        .array(
          z.object({
            type: z.string().describe("lead | company | contact | property | job | outcome | campaign | persona"),
            id: z.string(),
            label: z.string(),
            href: z.string(),
          }),
        )
        .describe("The records you referenced"),
    },
    async (args) => {
      for (const s of args.sources) addSource({ type: s.type, id: s.id, label: s.label, href: s.href });
      return textResult(`Cited ${args.sources.length} source(s).`);
    },
  );
}
