/**
 * BSR demo/seed persona taxonomy. This is a demo-tenant seed set and the offline
 * fallback for callers that have not been made org-aware — it is NOT the global
 * validation authority. Per-org validity comes from each org's active
 * `personas.slug` rows, loaded via `getOrgPersonaKeys` in
 * `src/lib/personas/read-model.ts`. `unassigned_persona` stays internal-only.
 */
export const OFFICIAL_PERSONA_MAPPINGS = [
  "persona_homeowner_emergency",
  "persona_homeowner_preventative",
  "persona_homeowner_rebuild",
  "persona_landlord",
  "persona_hoa_board",
  "persona_property_manager",
  "persona_insurance_agent",
  "persona_listing_agent",
  "persona_buyers_agent",
  "persona_plumbing_partner",
  "persona_hvac_roof_electrical_partner",
  "persona_gc_remodeler_partner",
] as const;

export type OfficialPersonaMapping = (typeof OFFICIAL_PERSONA_MAPPINGS)[number];

export const INTERNAL_UNASSIGNED_PERSONA = "unassigned_persona" as const;

export type InternalPersonaFallback = typeof INTERNAL_UNASSIGNED_PERSONA;
export type PersonaMapping = OfficialPersonaMapping | InternalPersonaFallback;
export type LeadIngestionPersonaMapping = OfficialPersonaMapping;

const OFFICIAL_PERSONA_SET = new Set<string>(OFFICIAL_PERSONA_MAPPINGS);

/** Words in persona keys that are acronyms and must stay fully uppercase in labels. */
const PERSONA_LABEL_ACRONYMS = new Set(["hoa", "hvac", "gc"]);

/**
 * Human-readable sentence-case label for a persona key or slug:
 * `persona_hoa_board` → "HOA board", `persona_property_manager` → "Property manager".
 * Pure casing only — callers decide how to treat unassigned/empty values.
 */
export function humanizePersonaLabel(persona: string): string {
  const words = (persona || "")
    .replace(/^persona[\s_-]+/i, "")
    .split(/[\s_-]+/)
    .filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (PERSONA_LABEL_ACRONYMS.has(lower)) return lower.toUpperCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export function isOfficialPersonaMapping(
  persona: unknown,
): persona is OfficialPersonaMapping {
  return typeof persona === "string" && OFFICIAL_PERSONA_SET.has(persona);
}

export function isInternalPersonaFallback(
  persona: unknown,
): persona is InternalPersonaFallback {
  return persona === INTERNAL_UNASSIGNED_PERSONA;
}

export function isPersonaMapping(persona: unknown): persona is PersonaMapping {
  return isOfficialPersonaMapping(persona) || isInternalPersonaFallback(persona);
}

export function isAllowedForLeadIngestion(
  persona: unknown,
): persona is LeadIngestionPersonaMapping {
  return isOfficialPersonaMapping(persona);
}

export function isAllowedPersona(
  persona: unknown,
  allowedKeys: readonly string[],
): persona is string {
  return typeof persona === "string" && allowedKeys.includes(persona);
}

export type PersonaValidationResult =
  | {
      ok: true;
      persona: string;
    }
  | {
      ok: false;
      code:
        | "persona_required"
        | "persona_internal_only"
        | "persona_invalid_type"
        | "persona_unknown";
      message: string;
    };

export function validateLeadIngestionPersona(
  persona: unknown,
  allowedKeys: readonly string[] = OFFICIAL_PERSONA_MAPPINGS,
): PersonaValidationResult {
  if (persona == null || persona === "") {
    return {
      ok: false,
      code: "persona_required",
      message: "Lead ingestion requires a verified operational persona tag.",
    };
  }

  if (isInternalPersonaFallback(persona)) {
    return {
      ok: false,
      code: "persona_internal_only",
      message: "unassigned_persona is internal-only and cannot ingest new leads.",
    };
  }

  if (typeof persona !== "string") {
    return {
      ok: false,
      code: "persona_invalid_type",
      message: "Persona tag must be a string literal.",
    };
  }

  if (!allowedKeys.includes(persona)) {
    return {
      ok: false,
      code: "persona_unknown",
      message: `Unknown persona tag: ${persona}`,
    };
  }

  return {
    ok: true,
    persona,
  };
}
