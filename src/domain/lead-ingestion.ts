import { z } from "zod";

import { resolveAttribution, type ResolvedAttribution } from "./attribution";
import { classifyLossSignals } from "./loss-classification";
import { OFFICIAL_PERSONA_MAPPINGS, validateLeadIngestionPersona } from "./personas";
import { calculateScores } from "./scoring";

const stringField = z.string().trim().min(1);

const attributionInputSchema = z.object({
  campaignId: z.string().trim().optional(),
  campaignAssetId: z.string().trim().optional(),
  channel: z.string().trim().optional(),
  token: z.string().trim().optional(),
  utmSource: z.string().trim().optional(),
  utmMedium: z.string().trim().optional(),
  utmCampaign: z.string().trim().optional(),
});

const contactSchema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().optional(),
  })
  .refine(
    (contact) => Boolean(contact.firstName || contact.lastName || contact.email || contact.phone),
    {
      message: "Contact must include a name, email, or phone.",
    },
  );

export const leadIngestionSchema = z.object({
  persona: z.unknown(),
  source: stringField,
  externalLeadId: z.string().trim().min(1).optional(),
  company: z
    .object({
      name: stringField,
      partnerTier: z.enum(["A", "B", "C"]).optional(),
      networkConnection: z.enum(["warm_intro", "cold_outreach"]).optional(),
    })
    .optional(),
  contact: contactSchema.optional(),
  property: z
    .object({
      streetLine1: stringField,
      streetLine2: z.string().trim().optional(),
      city: stringField,
      state: z.string().trim().length(2),
      postalCode: stringField,
    })
    .optional(),
  lossSummary: z.string().trim().optional(),
  lossSignals: z.array(z.string().trim().min(1)).min(1),
  metadata: z
    .object({
      after_hours_call: z.boolean().optional(),
      photo_uploaded: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  // Best-effort: a malformed attribution block coerces to undefined (.catch) so it
  // can never reject a lead. Resolution happens after parse.
  attribution: attributionInputSchema.optional().catch(undefined),
}).refine((lead) => Boolean(lead.company || lead.contact || lead.property), {
  message: "Lead must include at least one company, contact, or property relationship.",
  path: ["relationship"],
});

export type LeadIngestionInput = z.input<typeof leadIngestionSchema>;
export type ParsedLeadIngestionInput = z.output<typeof leadIngestionSchema>;

export type LeadIngestionResult =
  | {
      ok: true;
      status: "accepted";
      routing: "elevated" | "target" | "needs_review" | "archived";
      persona: string;
      classification: ReturnType<typeof classifyLossSignals>;
      scores: ReturnType<typeof calculateScores>;
      normalizedInput: ParsedLeadIngestionInput;
      attribution: ResolvedAttribution;
    }
  | {
      ok: false;
      status: "rejected";
      httpStatus: 400;
      errors: Array<{
        code: string;
        message: string;
        path?: string[];
      }>;
    };

export function parseLeadIngestionPayload(
  payload: unknown,
  calculatedAt?: Date | string,
  allowedPersonaKeys: readonly string[] = OFFICIAL_PERSONA_MAPPINGS,
): LeadIngestionResult {
  const parsed = leadIngestionSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      httpStatus: 400,
      errors: parsed.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.map(String),
      })),
    };
  }

  const persona = validateLeadIngestionPersona(parsed.data.persona, allowedPersonaKeys);

  if (!persona.ok) {
    return {
      ok: false,
      status: "rejected",
      httpStatus: 400,
      errors: [
        {
          code: persona.code,
          message: persona.message,
          path: ["persona"],
        },
      ],
    };
  }

  const classification = classifyLossSignals([
    parsed.data.lossSummary ?? "",
    ...parsed.data.lossSignals,
  ]);
  const scores = calculateScores({
    lead: {
      standingWater: classification.matchedTargetKeywords.includes("standing water"),
      photoUploaded: parsed.data.metadata?.photo_uploaded,
      afterHoursCall: parsed.data.metadata?.after_hours_call,
    },
    partner: {
      tier: parsed.data.company?.partnerTier,
      relationshipSignal: parsed.data.company?.networkConnection,
    },
    calculatedAt,
  });

  const attribution = resolveAttribution({
    ...(parsed.data.attribution ?? {}),
    source: parsed.data.source,
  });

  return {
    ok: true,
    status: "accepted",
    routing: mapRouting(classification.routingRecommendation),
    persona: persona.persona,
    classification,
    scores,
    normalizedInput: parsed.data,
    attribution,
  };
}

function mapRouting(
  recommendation: ReturnType<typeof classifyLossSignals>["routingRecommendation"],
): LeadIngestionResult extends infer TResult
  ? TResult extends { ok: true; routing: infer TRouting }
    ? TRouting
    : never
  : never {
  if (recommendation === "elevate") {
    return "elevated";
  }

  if (recommendation === "archive_low_priority") {
    return "archived";
  }

  return "needs_review";
}
