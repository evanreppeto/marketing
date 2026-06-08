import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const optionalText = z.string().trim().min(1).optional();

export const competitorIntelRequestSchema = z.object({
  source: z.enum(["meta_ad_library", "google_ads_transparency", "similarweb", "landing_page"]),
  competitorName: z.string().trim().min(1),
  competitorUrl: z.string().trim().url().optional(),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS).optional(),
  status: z.enum(["needs_review", "confirmed", "archived"]).default("needs_review"),
  capturedAt: z.string().trim().min(1).optional(),
  summary: z.string().trim().default(""),
  channelMix: z.record(z.string(), z.number()).default({}),
  estSpend: optionalText,
  topKeywords: z.array(z.string().trim().min(1)).default([]),
  adCreatives: z.array(z.record(z.string(), z.unknown())).default([]),
  rawPayload: z.record(z.string(), z.unknown()).default({}),
  operator: z.string().trim().min(1).default("Mark"),
});

export type CompetitorIntelRequest = z.output<typeof competitorIntelRequestSchema>;

export function parseCompetitorIntelPayload(input: unknown): CompetitorIntelRequest {
  return competitorIntelRequestSchema.parse(input ?? {});
}

export function competitorIntelDedupeKey(input: { source: string; competitorName: string; capturedAt?: string }): string {
  const day = (input.capturedAt ?? "").slice(0, 10);
  return `${input.source}:${input.competitorName.trim().toLowerCase()}:${day}`;
}

export function scoreCompetitorActivity(input: { adCreatives?: unknown[] }): {
  activityLevel: "low" | "medium" | "high";
  signals: string[];
} {
  const count = input.adCreatives?.length ?? 0;
  const signals = [`${count} active creatives`];
  const activityLevel = count >= 5 ? "high" : count >= 2 ? "medium" : "low";
  return { activityLevel, signals };
}
