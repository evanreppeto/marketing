import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import type { ToolContext } from "./index";
import { textResult, type StepFn } from "./helpers";

/**
 * Map an asset type to the card's channel/format so the chat thumbnail can render
 * a typed preview (email layout, SMS bubble, document) instead of a blank tile.
 * The app's AssetThumb keys off lowercased `${channel} ${format}` — keep these
 * strings matching its checks (email / sms / pdf / 1:1 …).
 */
function cardChannelFormat(assetType: string): { channel?: string; format?: string } {
  switch (assetType.toLowerCase()) {
    case "email":
      return { channel: "Email" };
    case "sms":
    case "text":
      return { channel: "SMS" };
    case "one_pager":
    case "pdf":
      return { channel: "One-pager", format: "pdf" };
    case "landing_page":
      return { channel: "Landing page" };
    case "social_ad":
      return { channel: "Paid social", format: "1:1" };
    case "video_ad":
      return { channel: "Video", format: "9:16" };
    case "image":
    case "image_prompt":
      return { channel: "Image", format: "1:1" };
    default:
      return {};
  }
}

/**
 * Draft work products (act/draft mode). `create_campaign_draft` creates a real,
 * approval-gated campaign asset (pending_approval, dispatch_locked) and auto-emits
 * a draft card carrying the inline Approve/Decline block. Nothing goes outbound;
 * the operator approves before anything is usable.
 */
export function draftWorkProductTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
  ctx: ToolContext = {},
) {
  const createCampaignDraft = tool(
    "create_campaign_draft",
    "Create an approval-gated campaign DRAFT asset (e.g. social_ad, email, sms, image_prompt, landing_page, one_pager). Attach to an existing campaign with campaign_id, or create a new draft campaign by giving name + persona (use a persona key) + restoration_focus (water|flood|sewage|mold|fire|storm). The asset is created pending approval and surfaced with an inline Approve/Decline card — nothing is sent. Returns campaignId + assetId.",
    {
      campaign_id: z.string().optional().describe("Existing campaign to attach to; omit to create a new draft campaign"),
      name: z.string().optional().describe("New campaign name (required when campaign_id is omitted)"),
      persona: z.string().optional().describe("Persona key (required when creating a new campaign)"),
      restoration_focus: z
        .string()
        .optional()
        .describe("Loss focus: water|flood|sewage|mold|fire|storm (required when creating a new campaign)"),
      asset_type: z.string().describe("Asset type, e.g. social_ad | email | sms | image_prompt | landing_page | one_pager"),
      title: z.string().describe("Short title for the asset"),
      body: z.string().optional().describe("The draft copy/content"),
      media_url: z.string().optional().describe("Optional reference media URL"),
    },
    async (args) => {
      const label = "Creating campaign draft";
      await step(label, "running");
      try {
        const r = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            ...args,
            ...(args.campaign_id ? {} : ctx.campaignId ? { campaign_id: ctx.campaignId } : {}),
            ...(ctx.opportunityId ? { opportunity_id: ctx.opportunityId } : {}),
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          status: "draft",
          ...cardChannelFormat(args.asset_type),
          ...(args.body ? { preview: args.body.slice(0, 280) } : {}),
          ...(args.media_url ? { media: { kind: "image", url: args.media_url } } : {}),
          approval: { kind: "campaign", campaignId: r.campaignId, assetId: r.assetId },
        });
        return textResult(
          JSON.stringify({ campaignId: r.campaignId, assetId: r.assetId, status: "draft created, pending approval" }),
        );
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [createCampaignDraft];
}
