import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard, ArcMedia } from "../types";
import { runTool, textResult, type StepFn } from "./helpers";

/**
 * Library media tools. `list_media` lets Arc SEE the operator's real, approved
 * BSR media (available_to_arc) so it can reuse authentic proof instead of always
 * generating AI images. `attach_media` puts one of those real assets on a
 * campaign draft for approval — the asset is validated server-side and stays
 * pending_approval. Never outbound.
 */
export function libraryReadTools(client: ArcClient, step: StepFn) {
  const listMedia = tool(
    "list_media",
    "List REAL BSR media in the operator's Library that is available to you (photos, video, logos, docs the operator marked available_to_arc). Use this to find and REUSE authentic approved media instead of generating a new AI image. Returns each asset's id, file name, kind, dimensions, tags, risk flags, and the folder it lives in. Optionally filter by kind (image | video | logo | document) or by folder_id (from list_folders). To put one on a campaign draft for approval, call attach_media with its id.",
    {
      kind: z.string().optional().describe("Filter by kind: image | video | logo | document"),
      folder_id: z.string().optional().describe("Only return assets in this folder (id from list_folders)"),
      limit: z.number().optional().describe("Max assets to return (default 50)"),
    },
    async (args) =>
      runTool(step, "Reading library", () =>
        client.apiGet("/api/v1/arc/media", { kind: args.kind, folder_id: args.folder_id, limit: args.limit }),
      ),
  );

  const listFolders = tool(
    "list_folders",
    "List the operator's Library folders (e.g. Logos & Brand, Team & People, Before & After / Proof). Each folder has a name, a description of what belongs in it, and a count of media available to you. Use a folder's description to decide which media fits a campaign, and use file_asset to organize media into the right folder. Returns id, name, description, parentId, availableAssetCount.",
    {},
    async () => runTool(step, "Reading folders", () => client.apiGet("/api/v1/arc/folders", {})),
  );

  return [listMedia, listFolders];
}

/** Library organization writes (act/draft modes). Create folders and file assets
 *  into them. Direct, org-scoped, reversible writes — organizing the Library is
 *  internal and never goes outbound, so no approval card. */
export function libraryWriteTools(client: ArcClient, step: StepFn) {
  const createFolder = tool(
    "create_folder",
    "Create a folder in the operator's Library to organize media (e.g. Logos, Team, Before & After / Proof). Provide a name and a short description of what belongs in it so you remember its purpose. Optionally nest under parent_id. Internal and reversible — nothing goes outbound.",
    {
      name: z.string().describe("Folder name, e.g. 'Before & After / Proof'"),
      description: z.string().optional().describe("What belongs in this folder / what it's for"),
      parent_id: z.string().optional().describe("Parent folder id to nest under"),
    },
    async (args) =>
      runTool(step, `Creating folder ${args.name}`, () =>
        client.apiPost("/api/v1/arc/media", {
          action: "create_folder",
          name: args.name,
          description: args.description,
          parent_id: args.parent_id,
        }),
      ),
  );

  const fileAsset = tool(
    "file_asset",
    "Move a Library asset into a folder to keep media organized. Provide asset_id (from list_media) and the target folder_id (from list_folders); omit folder_id to move it to the Library root. Internal and reversible — nothing goes outbound.",
    {
      asset_id: z.string().describe("Asset id from list_media"),
      folder_id: z.string().optional().describe("Target folder id from list_folders; omit for the Library root"),
    },
    async (args) =>
      runTool(step, `Filing asset ${args.asset_id}`, () =>
        client.apiPost("/api/v1/arc/media", {
          action: "file_asset",
          asset_id: args.asset_id,
          folder_id: args.folder_id ?? null,
        }),
      ),
  );

  return [createFolder, fileAsset];
}

export function libraryDraftTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
  ctx: { conversationId?: string | null; campaignId?: string | null } = {},
) {
  const attachMedia = tool(
    "attach_media",
    "Attach a REAL Library asset (by id from list_media) to a campaign as an approval-gated draft asset — the approval-safe way to reuse authentic BSR photos/video. Provide library_asset_id and a short title. Attach to an existing campaign with campaign_id, OR start a new draft campaign with name + persona (a persona key) + restoration_focus (one of: flood | water_backup | burst_pipe | storm_surge | standing_water | mold | sewage | fire). The asset stays pending approval and never goes outbound.",
    {
      library_asset_id: z.string().describe("Asset id from list_media"),
      title: z.string().describe("Short title for the attached asset"),
      asset_type: z.string().optional().describe("default social_ad"),
      campaign_id: z.string().optional().describe("Existing campaign to attach to; omit to create a new draft campaign"),
      name: z.string().optional().describe("New campaign name (when campaign_id omitted)"),
      persona: z.string().optional().describe("Persona key (required when creating a new campaign)"),
      restoration_focus: z
        .string()
        .optional()
        .describe("Loss focus, required when creating a new campaign. One of: flood | water_backup | burst_pipe | storm_surge | standing_water | mold | sewage | fire"),
    },
    async (args) => {
      const label = "Attaching media";
      await step(label, "running");
      try {
        const res = await client.apiPost<{ campaignId: string; assetId: string; media: ArcMedia }>(
          "/api/v1/arc/library/attach",
          {
            library_asset_id: args.library_asset_id,
            title: args.title,
            asset_type: args.asset_type,
            campaign_id: args.campaign_id ?? ctx.campaignId,
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: res.media,
          approval: { kind: "campaign", campaignId: res.campaignId, assetId: res.assetId },
        });
        return textResult(
          JSON.stringify({
            campaignId: res.campaignId,
            assetId: res.assetId,
            media: res.media,
            status: "library asset attached, pending approval",
          }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );
  return [attachMedia];
}
