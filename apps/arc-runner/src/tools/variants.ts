import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { textResult, type StepFn } from "./helpers";

/**
 * Submit a scored batch of ad variants. Arc first generates N variants
 * (generate_video / generate_image) and, for videos, calls
 * mcp__higgsfield__virality_predictor on each to get analysis.scores. It then
 * calls this tool with every variant + its raw scores; the server ranks them,
 * submits the top-K as approval-gated drafts with virality badges, and returns
 * the ranking rationale. Never outbound.
 */
export function variantsTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
  ctx: { conversationId?: string | null; campaignId?: string | null } = {},
) {
  const submitAdVariants = tool(
    "submit_ad_variants",
    "Submit a scored batch of generated ad variants for ranking. FIRST generate N variants (generate_video for video ads, generate_image for image ads), and for EACH video call mcp__higgsfield__virality_predictor and poll it to completion to get analysis.scores. THEN call this with every variant. For videos include `analysis` (the raw analysis.scores object: viral_potential, hook_score, sustain, brain_engagement, peak_second) and optionally `dashboard_url`. For images include format_matches_channel / has_brand / width / height. The server scores, ranks, submits the top-K as approval-gated drafts, and returns the rationale — relay it. Attach to campaign_id or start a new draft campaign with name + persona + campaign_theme.",
    {
      campaign_id: z.string().optional(),
      name: z.string().optional(),
      persona: z.string().optional(),
      campaign_theme: z.string().optional().describe("Short, industry-appropriate campaign theme when creating a new campaign"),
      restoration_focus: z.string().optional().describe("Legacy restoration focus (BSR only) — optional; prefer campaign_theme"),
      asset_type: z.string().describe("e.g. video_ad | image_prompt"),
      top_k: z.number().optional().describe("how many top variants to submit (default 2)"),
      variants: z
        .array(
          z.object({
            title: z.string(),
            media_url: z.string(),
            media_path: z.string().optional(),
            media: z.record(z.string(), z.unknown()).optional(),
            analysis: z.record(z.string(), z.unknown()).optional(),
            dashboard_url: z.string().optional(),
            format_matches_channel: z.boolean().optional(),
            has_brand: z.boolean().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          }),
        )
        .describe("Every generated variant with its scores"),
    },
    async (args) => {
      const label = "Ranking ad variants";
      await step(label, "running");
      try {
        const res = await client.apiPost<{
          campaignId: string;
          submitted: Array<{ assetId: string; title: string }>;
          ranked: { rationale: string; topK: Array<{ title: string }> };
        }>("/api/v1/arc/campaigns/submit-variants", {
          ...(args.campaign_id
            ? { campaign_id: args.campaign_id }
            : ctx.campaignId
              ? { campaign_id: ctx.campaignId }
              : {}),
          name: args.name,
          persona: args.persona,
          campaign_theme: args.campaign_theme,
          restoration_focus: args.restoration_focus,
          asset_type: args.asset_type,
          top_k: args.top_k,
          variants: args.variants,
          ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
        });
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: `Top ${res.submitted.length} of ${args.variants.length} variants`,
          rows: [],
          flags: [],
          preview: res.ranked.rationale,
          ...(res.submitted[0]
            ? { approval: { kind: "campaign" as const, campaignId: res.campaignId, assetId: res.submitted[0].assetId } }
            : {}),
        });
        return textResult(
          JSON.stringify({ campaignId: res.campaignId, submitted: res.submitted, rationale: res.ranked.rationale }),
        );
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [submitAdVariants];
}
