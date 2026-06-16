import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

const optionalText = z.string().trim().min(1).optional();

export const arcSocialAdRequestSchema = z.object({
  workflow: z.literal("social_ad").default("social_ad"),
  name: z.string().trim().min(1),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS),
  restorationFocus: z.enum([
    "flood", "water_backup", "burst_pipe", "storm_surge", "standing_water", "mold", "sewage", "fire",
  ]),
  objective: z.string().trim().min(1).default("Social image ad submitted for human approval."),
  // Shared ad copy across all formats.
  headline: optionalText,
  body: optionalText,
  ctaLabel: optionalText,
  ctaPhone: optionalText,
  // One entry per rendered format (e.g. square + vertical). Each becomes a deliverable.
  // The image bytes are sent inline (base64 PNG); the app stores them itself.
  assets: z
    .array(
      z.object({
        imageBase64: z.string().trim().min(1),
        format: optionalText,
      }),
    )
    .min(1),
  sourceCampaignId: optionalText,
  operator: z.string().trim().min(1).default("Arc"),
});

export type ArcSocialAdRequest = z.output<typeof arcSocialAdRequestSchema>;

export function parseArcSocialAdRequest(input: unknown): ArcSocialAdRequest {
  return arcSocialAdRequestSchema.parse(input ?? {});
}
