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
