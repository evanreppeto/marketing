import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard, ArcMedia } from "../types";
import { textResult, type StepFn } from "./helpers";

/**
 * Media generation (act/draft mode). `generate_image` creates an AI image and
 * lands it as an approval-gated draft campaign asset with a thumbnail card.
 * AI-tagged + risk-flagged + locked pending approval — never outbound, never a
 * fabricated "proof" of a real job. The server hardens the prompt (strips any
 * embedded text/logos/branding) for every business; choose the look via `style`.
 */
export function mediaTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  const generateImage = tool(
    "generate_image",
    "Generate an AI image for a campaign asset and surface it as an approval-gated draft with a thumbnail. Use for concept / background / lifestyle / variant creative — NEVER to fabricate proof of a real job or result. Describe the SCENE in `prompt` and the MEDIUM/LOOK in `style` (e.g. 'candid documentary photograph, natural lighting' for realism, or an illustration/3D style). Do NOT ask for any text, words, logos, or signage in the image — the server strips those and real branding is added later in design. Attach to an existing campaign with campaign_id, or start a new draft campaign with name + persona (a persona key) + restoration_focus. The image is AI-generated, tagged as such, risk-flagged, and awaits approval.",
    {
      prompt: z.string().describe("The scene/subject to generate — an illustrative concept, not a staged 'real job'. No text/logos."),
      title: z.string().describe("Short title for the asset"),
      style: z
        .string()
        .optional()
        .describe("Visual medium/look, e.g. 'candid documentary photograph, natural lighting' for realism; or illustration/3D/etc."),
      aspect_ratio: z.string().optional().describe("1:1 | 3:4 | 4:3 | 9:16 | 16:9 (default 1:1)"),
      asset_type: z.string().optional().describe("default image_prompt"),
      campaign_id: z.string().optional().describe("Existing campaign to attach to; omit to create a new draft campaign"),
      name: z.string().optional().describe("New campaign name (when campaign_id omitted)"),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
    },
    async (args) => {
      const label = "Generating image";
      await step(label, "running");
      try {
        const gen = await client.apiPost<{ media: ArcMedia; objectPath?: string }>("/api/v1/arc/media/generate-image", {
          prompt: args.prompt,
          style: args.style,
          aspect_ratio: args.aspect_ratio,
        });
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            campaign_id: args.campaign_id,
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "image_prompt",
            title: args.title,
            media_url: gen.media.url,
            media_path: gen.objectPath,
            media: gen.media,
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: gen.media,
          approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
        });
        return textResult(
          JSON.stringify({
            campaignId: draft.campaignId,
            assetId: draft.assetId,
            media: gen.media,
            status: "image draft created, pending approval",
          }),
        );
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [generateImage];
}
