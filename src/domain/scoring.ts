export type PartnerTier = "A" | "B" | "C";
export type PartnerRelationshipSignal = "warm_intro" | "cold_outreach";

export type LeadScoreSignals = {
  standingWater?: boolean;
  photoUploaded?: boolean;
  afterHoursCall?: boolean;
};

export type PartnerScoreSignals = {
  tier?: PartnerTier | null;
  relationshipSignal?: PartnerRelationshipSignal | null;
};

export type ScoreCalculationInput = {
  lead?: LeadScoreSignals;
  partner?: PartnerScoreSignals;
  calculatedAt?: Date | string;
};

export type ScoreCalculationResult = {
  leadScore: number;
  partnerScore: number;
  calculatedAt: string;
};

const MAX_SCORE = 100;
const BASE_LEAD_SCORE = 10;

const PARTNER_TIER_POINTS: Record<PartnerTier, number> = {
  A: 50,
  B: 30,
  C: 10,
};

const PARTNER_RELATIONSHIP_POINTS: Record<PartnerRelationshipSignal, number> = {
  warm_intro: 30,
  cold_outreach: 10,
};

export function calculateLeadScore(signals: LeadScoreSignals = {}): number {
  const rawScore =
    BASE_LEAD_SCORE +
    (signals.standingWater ? 40 : 0) +
    (signals.photoUploaded ? 20 : 0) +
    (signals.afterHoursCall ? 30 : 0);

  return capScore(rawScore);
}

export function calculatePartnerScore(signals: PartnerScoreSignals = {}): number {
  const rawScore =
    (signals.tier ? PARTNER_TIER_POINTS[signals.tier] : 0) +
    (signals.relationshipSignal
      ? PARTNER_RELATIONSHIP_POINTS[signals.relationshipSignal]
      : 0);

  return capScore(rawScore);
}

export function calculateScores(
  input: ScoreCalculationInput = {},
): ScoreCalculationResult {
  return {
    leadScore: calculateLeadScore(input.lead),
    partnerScore: calculatePartnerScore(input.partner),
    calculatedAt: normalizeCalculatedAt(input.calculatedAt),
  };
}

function capScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(0, score));
}

function normalizeCalculatedAt(calculatedAt: Date | string | undefined): string {
  if (calculatedAt instanceof Date) {
    return calculatedAt.toISOString();
  }

  if (typeof calculatedAt === "string") {
    return new Date(calculatedAt).toISOString();
  }

  return new Date().toISOString();
}
