/**
 * Brand Kit — pure, industry-agnostic business-identity logic. No I/O.
 * Persistence lives in `src/lib/brand-kit/`. This module owns the shape of a
 * business profile, the neutral defaults a brand-new org starts from, the
 * quick-start industry templates, and the assembly of the Arc context bundle.
 */

export type DensityOption = "comfortable" | "compact";
export type MotionOption = "standard" | "reduced";
export type ProfileStatus = "draft" | "active";

export type ProofPoint = {
  kind: "testimonial" | "certification" | "stat";
  label: string;
  detail?: string;
};

export type BrandKitGuardrails = {
  /** Human-readable labels of claim types the business must not make. */
  disallowedClaims: string[];
  /** Free-form compliance guidance shown to Arc and reviewers. */
  complianceNotes: string;
};

export type PersonaDefinition = {
  key: string;
  label: string;
  audienceType: string;
  sortOrder: number;
  isActive: boolean;
  metadata: {
    description?: string;
    recommendedCta?: string;
    messageAngle?: string;
    proofPoints?: string[];
  };
};

export type BusinessProfile = {
  displayName: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  industry: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  shortMark: string | null;
  serviceAreas: string[];
  timeZone: string | null;
  accent: string;
  density: DensityOption;
  motion: MotionOption;
  tone: string;
  voiceGuidance: string | null;
  preferredPhrases: string[];
  bannedPhrases: string[];
  services: string[];
  proofPoints: ProofPoint[];
  guardrails: BrandKitGuardrails;
  status: ProfileStatus;
};

export const NEUTRAL_PERSONAS: PersonaDefinition[] = [
  {
    key: "decision_maker",
    label: "Decision maker",
    audienceType: "customer",
    sortOrder: 0,
    isActive: true,
    metadata: { description: "The person who chooses and pays for the service." },
  },
  {
    key: "referrer",
    label: "Referrer",
    audienceType: "partner",
    sortOrder: 1,
    isActive: true,
    metadata: { description: "Someone positioned to refer business your way." },
  },
  {
    key: "repeat_customer",
    label: "Repeat customer",
    audienceType: "customer",
    sortOrder: 2,
    isActive: true,
    metadata: { description: "An existing customer who may buy again." },
  },
];

export const NEUTRAL_DEFAULTS: BusinessProfile = {
  displayName: "",
  legalName: null,
  tagline: null,
  description: null,
  industry: null,
  websiteUrl: null,
  logoUrl: null,
  faviconUrl: null,
  shortMark: null,
  serviceAreas: [],
  timeZone: null,
  accent: "#C8A24B",
  density: "comfortable",
  motion: "standard",
  tone: "balanced",
  voiceGuidance: null,
  preferredPhrases: [],
  bannedPhrases: [],
  services: [],
  proofPoints: [],
  guardrails: {
    disallowedClaims: [
      "False or unverifiable claims",
      "Misleading pricing or fake urgency",
      "Guarantees of outcomes outside the business's control",
    ],
    complianceNotes:
      "Keep claims truthful and substantiated. Avoid promises the business cannot guarantee.",
  },
  status: "draft",
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Map a raw `business_profiles` row (snake_case, jsonb) into a BusinessProfile. */
export function parseBusinessProfile(row: Record<string, unknown>): BusinessProfile {
  const guardrailsRaw = (row.guardrails ?? {}) as Record<string, unknown>;
  const density = row.density === "compact" ? "compact" : "comfortable";
  const motion = row.motion === "reduced" ? "reduced" : "standard";
  const status = row.status === "active" ? "active" : "draft";
  return {
    displayName: asString(row.display_name, NEUTRAL_DEFAULTS.displayName),
    legalName: asNullableString(row.legal_name),
    tagline: asNullableString(row.tagline),
    description: asNullableString(row.description),
    industry: asNullableString(row.industry),
    websiteUrl: asNullableString(row.website_url),
    logoUrl: asNullableString(row.logo_url),
    faviconUrl: asNullableString(row.favicon_url),
    shortMark: asNullableString(row.short_mark),
    serviceAreas: asStringArray(row.service_areas),
    timeZone: asNullableString(row.time_zone),
    accent: asString(row.accent, NEUTRAL_DEFAULTS.accent),
    density,
    motion,
    tone: asString(row.tone, NEUTRAL_DEFAULTS.tone),
    voiceGuidance: asNullableString(row.voice_guidance),
    preferredPhrases: asStringArray(row.preferred_phrases),
    bannedPhrases: asStringArray(row.banned_phrases),
    services: asStringArray(row.services),
    proofPoints: Array.isArray(row.proof_points) ? (row.proof_points as ProofPoint[]) : [],
    guardrails: {
      disallowedClaims:
        asStringArray(guardrailsRaw.disallowedClaims).length > 0
          ? asStringArray(guardrailsRaw.disallowedClaims)
          : NEUTRAL_DEFAULTS.guardrails.disallowedClaims,
      complianceNotes: asString(
        guardrailsRaw.complianceNotes,
        NEUTRAL_DEFAULTS.guardrails.complianceNotes,
      ),
    },
    status,
  };
}

export type ProfileValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Validate a BusinessProfile prior to persistence. */
export function validateBusinessProfile(profile: BusinessProfile): ProfileValidationResult {
  const errors: string[] = [];
  if (profile.displayName.trim().length === 0) errors.push("display_name_required");
  if (!HEX_COLOR.test(profile.accent)) errors.push("accent_invalid");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
