import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

const optionalText = z.string().trim().min(1).optional();

export const hermesPartnerCampaignRequestSchema = z.object({
  workflow: z.literal("partner_campaign").default("partner_campaign"),
  objective: z
    .string()
    .trim()
    .min(1)
    .default("Create a referral partner campaign draft and submit it for human approval."),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS).default("persona_plumbing_partner"),
  channel: z.enum(["email", "sms", "call_script", "one_pager"]).default("email"),
  restorationFocus: z
    .enum(["flood", "water_backup", "burst_pipe", "storm_surge", "standing_water", "mold", "sewage", "fire"])
    .default("water_backup"),
  company: z
    .object({
      name: z.string().trim().min(1).default("Hermes Plumbing Partner"),
      websiteUrl: optionalText,
      phone: optionalText,
      email: z.string().trim().email().optional(),
      partnerTier: z.enum(["A", "B", "C"]).default("A"),
      serviceAreaZips: z.array(z.string().trim().min(1)).default(["60618", "60625", "60647"]),
    })
    .default({
      name: "Hermes Plumbing Partner",
      partnerTier: "A",
      serviceAreaZips: ["60618", "60625", "60647"],
    }),
  contact: z
    .object({
      firstName: z.string().trim().min(1).default("Jordan"),
      lastName: z.string().trim().min(1).default("Partner"),
      title: z.string().trim().min(1).default("Operations Manager"),
      email: z.string().trim().email().optional(),
      phone: optionalText,
    })
    .default({
      firstName: "Jordan",
      lastName: "Partner",
      title: "Operations Manager",
    }),
  lead: z
    .object({
      source: z.string().trim().min(1).default("hermes_agent"),
      lossSummary: z
        .string()
        .trim()
        .min(1)
        .default("Partner candidate has source-stop water-loss referral potential in priority Chicago ZIPs."),
      lossSignals: z.array(z.string().trim().min(1)).default(["water_backup", "burst_pipe", "emergency_service"]),
      matchedTargetKeywords: z.array(z.string().trim().min(1)).default(["plumber", "water damage", "emergency repair"]),
      evidenceUrls: z.array(z.string().trim().url()).default(["https://example-plumbing.local"]),
      leadScore: z.number().int().min(0).max(100).default(88),
      partnerScore: z.number().int().min(0).max(100).default(80),
    })
    .default({
      source: "hermes_agent",
      lossSummary: "Partner candidate has source-stop water-loss referral potential in priority Chicago ZIPs.",
      lossSignals: ["water_backup", "burst_pipe", "emergency_service"],
      matchedTargetKeywords: ["plumber", "water damage", "emergency repair"],
      evidenceUrls: ["https://example-plumbing.local"],
      leadScore: 88,
      partnerScore: 80,
    }),
  campaign: z
    .object({
      name: optionalText,
      audienceSummary: optionalText,
      offerSummary: optionalText,
      cta: z.string().trim().min(1).default("Set up a simple referral handoff process"),
      tone: z.string().trim().min(1).default("professional, direct, partner-protective"),
    })
    .default({
      cta: "Set up a simple referral handoff process",
      tone: "professional, direct, partner-protective",
    }),
  operator: z.string().trim().min(1).default("Hermes Agent"),
});

export type HermesPartnerCampaignRequest = z.output<typeof hermesPartnerCampaignRequestSchema>;
export type HermesPartnerCampaignRequestInput = z.input<typeof hermesPartnerCampaignRequestSchema>;

export function parseHermesPartnerCampaignRequest(input: unknown): HermesPartnerCampaignRequest {
  return hermesPartnerCampaignRequestSchema.parse(input ?? {});
}
