/**
 * The business Arc currently acts on behalf of. Single-tenant today (BSR), but
 * this object IS the multi-tenant seam: every per-business fact Arc needs is
 * here, injected into the system prompt by buildSystemPrompt(). Going
 * multi-tenant later means resolving this per-wake (by org id) instead of using
 * the constant — no change to the engine.
 */
export type ArcBusinessContext = {
  businessName: string;
  industry: string;
  brandVoice: string;
  /** Short note on approved-media posture and creative guardrails. */
  creativePolicy: string;
  /** Compliance / restricted-claims posture, stated for the model. */
  compliance: string;
};

export const BSR_CONTEXT: ArcBusinessContext = {
  businessName: "Big Shoulders Restoration (BSR)",
  industry: "Property damage restoration — water, flood, sewage, mold, fire, storm.",
  brandVoice: "Calm, expert, urgency-aware. Reassuring without overpromising. No hype, no emojis.",
  creativePolicy:
    "Prefer BSR's real, approved media. AI creative may package/resize/test authentic proof, never fabricate scenes. Flag embedded text, unrealistic scenes, privacy/redaction, and unsubstantiated claims.",
  compliance:
    "Never promise insurance coverage, claim approval, payouts, or timelines. Stay coverage-neutral. Keep to restoration scope (water/flood/sewage/mold/fire/storm); route hail-only, wind-only, exterior-roof-only, and unrelated remodeling out of scope.",
};

import type { ArcClient } from "./arc-client";

/** The rich context shape returned by GET /api/v1/arc/brand/context (app's assembleArcContext output). */
export type AppBusinessContext = {
  businessName: string;
  industry: string | null;
  services: string[];
  tone: string;
  voiceGuidance: string | null;
  preferredPhrases: string[];
  bannedPhrases: string[];
  proofPoints: Array<{ kind: string; label: string; detail?: string }>;
  personas: Array<{ key: string; label: string }>;
  guardrails: { disallowedClaims: string[]; complianceNotes: string };
};

/** Tenant-agnostic creative posture — the same for every business; brand specifics ride the other fields. */
const DEFAULT_CREATIVE_POLICY =
  "Prefer the business's real, approved media. AI creative may package/resize/test authentic proof, never fabricate scenes. Flag embedded text, unrealistic scenes, privacy/redaction, and unsubstantiated claims.";

/** Flatten the app's structured brand context into the runner's free-text 5-field prompt shape. */
export function fromAppContext(raw: AppBusinessContext): ArcBusinessContext {
  const services = raw.services.length ? ` Services: ${raw.services.join(", ")}.` : "";
  const voice = [
    `Tone: ${raw.tone}.`,
    raw.voiceGuidance ? `Guidance: ${raw.voiceGuidance}.` : null,
    raw.preferredPhrases.length ? `Preferred phrases: ${raw.preferredPhrases.join(", ")}.` : null,
    raw.bannedPhrases.length ? `Never use: ${raw.bannedPhrases.join(", ")}.` : null,
  ]
    .filter((b): b is string => Boolean(b))
    .join(" ");
  const proof = raw.proofPoints.length
    ? ` Proof points available: ${raw.proofPoints.map((p) => p.label).join("; ")}.`
    : "";
  const compliance =
    [
      raw.guardrails.complianceNotes || null,
      raw.guardrails.disallowedClaims.length ? `Do not claim: ${raw.guardrails.disallowedClaims.join(", ")}.` : null,
    ]
      .filter((b): b is string => Boolean(b))
      .join(" ") || "No specific compliance constraints recorded; stay accurate and avoid unverifiable claims.";

  return {
    businessName: raw.businessName,
    industry: (raw.industry ?? "Not specified") + services,
    brandVoice: voice,
    creativePolicy: DEFAULT_CREATIVE_POLICY + proof,
    compliance,
  };
}

/** Fetch + map the org's brand context for this turn; fall back to BSR_CONTEXT on any error. */
export async function resolveBusinessContext(client: ArcClient): Promise<ArcBusinessContext> {
  try {
    const res = await client.apiGet<{ context: AppBusinessContext }>("/api/v1/arc/brand/context");
    return fromAppContext(res.context);
  } catch {
    return BSR_CONTEXT;
  }
}
