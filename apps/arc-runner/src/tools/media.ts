import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard, ArcMedia } from "../types";
import { textResult, type StepFn } from "./helpers";

const VIDEO_POLL_MS = 10_000;
const VIDEO_MAX_POLLS = 36; // ~6 min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Media generation (act/draft mode). `generate_image` creates an AI image and
 * lands it as an approval-gated draft campaign asset with a thumbnail card.
 * AI-tagged + risk-flagged + locked pending approval — never outbound, never a
 * fabricated "proof" of a real job. The server hardens the prompt (strips any
 * embedded text/logos/branding) for every business; choose the look via `style`.
 */
export function mediaTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
  ctx: { level?: "fast" | "standard"; conversationId?: string | null; campaignId?: string | null } = {},
) {
  const generateImage = tool(
    "generate_image",
    "Generate an AI image for a campaign asset and surface it as an approval-gated draft with a thumbnail. Use for concept / background / lifestyle / variant creative — NEVER to fabricate proof of a real job or result. Describe the SCENE in `prompt` and the MEDIUM/LOOK in `style` (e.g. 'candid documentary photograph, natural lighting' for realism, or an illustration/3D style). Do NOT ask for any text, words, logos, or signage in the image — the server strips those and real branding is added later in design. Attach to an existing campaign with campaign_id, or start a new draft campaign with name + persona (a persona key) + restoration_focus. If the operator didn't specify these, DON'T interrogate them — infer a short descriptive campaign name and the best-fitting persona from the request and context, pick a sensible restoration_focus, generate now, and note your assumptions in your reply so they can adjust at approval. The image is AI-generated, tagged as such, risk-flagged, and awaits approval.",
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
          level: ctx.level,
        });
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            ...(args.campaign_id ? { campaign_id: args.campaign_id } : ctx.campaignId ? { campaign_id: ctx.campaignId } : {}),
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "image_prompt",
            title: args.title,
            media_url: gen.media.url,
            media_path: gen.objectPath,
            media: gen.media,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
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

  const generateVideo = tool(
    "generate_video",
    "Generate an AI VIDEO (Veo) for a campaign asset and surface it as an approval-gated draft with a playable clip. Use for short concept / lifestyle / ad clips — NEVER a fabricated 'real job' video. Describe the scene in prompt and the look in style. Videos render asynchronously (about 1-3 minutes); the operator sees progress. aspect_ratio is 16:9 or 9:16. Attach to an existing campaign with campaign_id, or start a new draft campaign with name + persona + restoration_focus.",
    {
      prompt: z.string().describe("The scene to generate. No text/logos."),
      title: z.string().describe("Short title for the asset"),
      style: z.string().optional().describe("Visual look, e.g. 'candid documentary, natural lighting'"),
      aspect_ratio: z.string().optional().describe("16:9 | 9:16 (default 16:9)"),
      duration_seconds: z.number().optional(),
      asset_type: z.string().optional().describe("default video_ad"),
      campaign_id: z.string().optional(),
      name: z.string().optional(),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
    },
    async (args) => {
      const label = "Generating video";
      await step(label, "running");
      try {
        const promptWithStyle = args.style ? `${args.prompt}\n\nStyle: ${args.style}.` : args.prompt;
        const start = await client.apiPost<{ operationName: string; model: string; jobId?: string }>(
          "/api/v1/arc/media/generate-video",
          { prompt: promptWithStyle, aspect_ratio: args.aspect_ratio, duration_seconds: args.duration_seconds, level: ctx.level },
        );
        let media: ArcMedia | null = null;
        let objectPath: string | undefined;
        for (let i = 0; i < VIDEO_MAX_POLLS; i++) {
          await sleep(VIDEO_POLL_MS);
          const poll = await client.apiPost<{ status: string; media?: ArcMedia; objectPath?: string }>(
            "/api/v1/arc/media/generate-video",
            { operation_name: start.operationName, prompt: promptWithStyle, model: start.model, job_id: start.jobId },
          );
          if (poll.status === "done" && poll.media) {
            media = poll.media;
            objectPath = poll.objectPath;
            break;
          }
        }
        if (!media) {
          await step(label, "done");
          return textResult(`${label} timed out — Veo is still rendering. Try again shortly.`);
        }
        const withFormat: ArcMedia = { ...media, format: args.aspect_ratio ?? "16:9" };
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            campaign_id: args.campaign_id,
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "video_ad",
            title: args.title,
            media_url: withFormat.url,
            media_path: objectPath,
            media: withFormat,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: withFormat,
          approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
        });
        return textResult(
          JSON.stringify({ campaignId: draft.campaignId, assetId: draft.assetId, media: withFormat, status: "video draft created, pending approval" }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );

  const composeCreative = tool(
    "compose_creative",
    "Produce a FINISHED, on-brand creative — the business's real logo + headline + CTA + brand colors/fonts composited onto an AI background — and land it as an approval-gated draft asset. Use this (not generate_image alone) whenever the operator wants a usable ad/social/one-pager creative. Provide the SCENE for the background via `prompt` (+ optional `style`), OR pass an existing `background_url`. Write the on-image words in `headline` (short, punchy), optional `kicker` (small eyebrow), and `cta_label` (button text). The server pulls the brand logo/palette/fonts from the Brand Kit and picks a layout (override with `template`). Do NOT bake text/logos into the background prompt — the compositor adds the real ones. Attach to an existing campaign with campaign_id, or start a new draft with name + persona + restoration_focus; infer sensible values rather than interrogating the operator and note your assumptions.",
    {
      headline: z.string().describe("The main on-image line — short and punchy. No logos/URLs."),
      title: z.string().describe("Short title for the asset"),
      prompt: z.string().optional().describe("Scene for the AI background (omit if passing background_url). No text/logos."),
      background_url: z.string().optional().describe("Use this existing image as the background instead of generating one"),
      style: z.string().optional().describe("Background look, e.g. 'candid documentary photograph, natural lighting'"),
      kicker: z.string().optional().describe("Small eyebrow line above the headline"),
      cta_label: z.string().optional().describe("Call-to-action button text, e.g. 'Call (312) 555-0199'"),
      format: z.string().optional().describe("1:1 | 4:5 | 9:16 | 16:9 (default 1:1)"),
      template: z.string().optional().describe("bold | editorial | minimal (default: auto-selected)"),
      asset_type: z.string().optional().describe("default image_prompt"),
      campaign_id: z.string().optional(),
      name: z.string().optional(),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
    },
    async (args) => {
      const label = "Composing creative";
      await step(label, "running");
      try {
        // 1. Resolve the background: use a passed URL, or generate one.
        let backgroundUrl = args.background_url?.trim();
        if (!backgroundUrl) {
          if (!args.prompt?.trim()) {
            await step(label, "done");
            return textResult("compose_creative needs either a background_url or a prompt to generate the background.");
          }
          const bg = await client.apiPost<{ media: ArcMedia }>("/api/v1/arc/media/generate-image", {
            prompt: args.prompt,
            style: args.style,
            aspect_ratio: args.format,
            level: ctx.level,
          });
          backgroundUrl = bg.media.url;
        }

        // 2. Composite the finished creative.
        const composed = await client.apiPost<{ media: ArcMedia; objectPath?: string; template: string }>(
          "/api/v1/arc/media/compose",
          {
            background_url: backgroundUrl,
            headline: args.headline,
            kicker: args.kicker,
            cta_label: args.cta_label,
            format: args.format,
            template: args.template,
            seed: ctx.campaignId ?? args.campaign_id,
          },
        );

        // 3. Land it as one approval-gated draft asset.
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            ...(args.campaign_id ? { campaign_id: args.campaign_id } : ctx.campaignId ? { campaign_id: ctx.campaignId } : {}),
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "image_prompt",
            title: args.title,
            media_url: composed.media.url,
            media_path: composed.objectPath,
            media: composed.media,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );

        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: composed.media,
          approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
        });
        return textResult(
          JSON.stringify({
            campaignId: draft.campaignId,
            assetId: draft.assetId,
            media: composed.media,
            template: composed.template,
            status: "finished composite created, pending approval",
          }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );

  return [generateImage, generateVideo, composeCreative];
}
