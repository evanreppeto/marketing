import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Scan-mode write tool: persist a source-backed competitor finding. Lands in
 * `competitor_campaigns` as status=needs_review for the operator to review — it
 * is intelligence, never an outbound action. Pairs with research_web (gather)
 * and propose_opportunity (act on a competitor_signal). The app forces the
 * Arc author + needs_review status; Arc only supplies the evidence.
 *
 * The competitor-intel route hands the body straight to the domain parser, which
 * expects camelCase keys — so this tool maps its snake_case params accordingly.
 */
export function competitorIntelTool(client: ArcClient, step: StepFn) {
  return tool(
    "record_competitor_intel",
    "Record a source-backed competitor finding into competitor intelligence (lands as needs_review for the operator — it's intelligence, never an outbound action). Use after research_web / reading a competitor's ads or landing page, when you have concrete evidence worth remembering. Ground every field in what you actually observed; don't invent spend or creatives. Source MUST be one of meta_ad_library | google_ads_transparency | similarweb | landing_page.",
    {
      source: z
        .enum(["meta_ad_library", "google_ads_transparency", "similarweb", "landing_page"])
        .describe("Where the finding came from."),
      competitor_name: z.string().describe("The competitor's name."),
      competitor_url: z.string().optional().describe("Competitor URL the finding came from."),
      persona: z.string().optional().describe("Persona key this competitor activity targets, e.g. persona_homeowner_emergency."),
      summary: z.string().optional().describe("What you observed — the headline of the finding."),
      channel_mix: z
        .record(z.string(), z.number())
        .optional()
        .describe("Estimated channel split, e.g. { meta: 0.7, google: 0.3 }."),
      est_spend: z.string().optional().describe("Estimated spend, if observable (a string, e.g. '$5k-10k/mo')."),
      top_keywords: z.array(z.string()).optional().describe("Keywords/themes the competitor is bidding on or emphasizing."),
      ad_creatives: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .describe("Structured notes on individual creatives (headline, angle, offer, media)."),
      captured_at: z.string().optional().describe("ISO timestamp of when the activity was observed (defaults to now)."),
    },
    async (args) =>
      runTool(step, `Recording competitor intel: ${args.competitor_name}`, () =>
        client.apiPost("/api/v1/arc/competitor-intel", {
          source: args.source,
          competitorName: args.competitor_name,
          ...(args.competitor_url ? { competitorUrl: args.competitor_url } : {}),
          ...(args.persona ? { persona: args.persona } : {}),
          ...(args.summary ? { summary: args.summary } : {}),
          ...(args.channel_mix ? { channelMix: args.channel_mix } : {}),
          ...(args.est_spend ? { estSpend: args.est_spend } : {}),
          ...(args.top_keywords ? { topKeywords: args.top_keywords } : {}),
          ...(args.ad_creatives ? { adCreatives: args.ad_creatives } : {}),
          ...(args.captured_at ? { capturedAt: args.captured_at } : {}),
        }),
      ),
  );
}
