import { NEUTRAL_DEFAULTS, type BusinessProfile, type ProofPoint } from "@/domain";

/** Split a textarea value into a trimmed, blank-free string list. */
export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function nullable(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v.length > 0 ? v : null;
}

/**
 * Merge submitted Brand Kit form fields over the org's current profile, so
 * fields not present in the form (e.g. appearance, personas) are preserved.
 * List fields come from newline-separated textareas.
 */
export function buildBusinessProfileFromForm(
  formData: FormData,
  current: BusinessProfile,
): BusinessProfile {
  const proofPoints: ProofPoint[] = splitLines(str(formData, "proofPoints")).map((label) => ({
    kind: "stat",
    label,
  }));
  const logoUpload = str(formData, "logoUpload");
  const logoUrl = str(formData, "logoUrl");
  return {
    ...current,
    displayName: str(formData, "displayName") || current.displayName,
    legalName: nullable(formData, "legalName"),
    tagline: nullable(formData, "tagline"),
    description: nullable(formData, "description"),
    industry: nullable(formData, "industry"),
    websiteUrl: nullable(formData, "websiteUrl"),
    logoUrl: logoUpload || logoUrl || null,
    faviconUrl: nullable(formData, "faviconUrl"),
    shortMark: nullable(formData, "shortMark"),
    serviceAreas: splitLines(str(formData, "serviceAreas")),
    tone: str(formData, "tone") || current.tone || NEUTRAL_DEFAULTS.tone,
    voiceGuidance: nullable(formData, "voiceGuidance"),
    preferredPhrases: splitLines(str(formData, "preferredPhrases")),
    bannedPhrases: splitLines(str(formData, "bannedPhrases")),
    services: splitLines(str(formData, "services")),
    proofPoints,
    guardrails: {
      disallowedClaims: splitLines(str(formData, "disallowedClaims")),
      complianceNotes: str(formData, "complianceNotes") || current.guardrails.complianceNotes,
    },
    status: formData.get("status") === "active" ? "active" : current.status,
  };
}
